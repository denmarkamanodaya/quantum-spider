/**
 * Full-Feed Spider
 *
 * This spider type begins to scrape a website from the main search page and
 * then spiders out to each of the different vertical external site details pages to find the
 * relevant data.
 */

var require = patchRequire(require);
var qs = require("../../../../library/js/QS.js");

/**
 * Scrape data navigation object
 *
 * As a spider runs through a site it adds scrape data to this object when they are
 * detected on a search results page. This object is then used to direct the
 * scraping of the scrape data detail from each scrape data page.
 *
 * @type {{links: Array, currentData: number}}
 */
var scrapeData = {
    links: [],
    currentData: 0,
    moreLotsExist: true
};
var search = {
    pages: [],
    currentPage: 0
};

// -----------------------------------------------------------------------------
// Casper initialization
// -----------------------------------------------------------------------------

/**
 * Initialize CasperJS
 */
var casper = qs.getCasper();

/**
 * Initialize any spider event listeners
 */
linkSpiderEventListeners();

casper
    .start(
        "http://www.cityauctiongroup.com/belfast/stock/vehicle-search/?location=41&mak=-&mod=-&der=-&grade="
    )
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the search pages
        */
        gatherSearchPages.call(this);

        /*
            Step 2: Loop through each search pages and gather all the lots info
        */
        gatherLotsInfoFromEachPages.call(this);

        /*
            Step 3: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            if (scrapeData.links.length > 0) {
                spiderDetailsPage.call(this);
            }
        });

        /*
            Step 4: finalize and send result to importer via API call
        */
        this.then(function() {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function gatherSearchPages() {
    this.then(function() {
        qs.log("Gather All Search pages if any.");
        var currentURL = casper.getCurrentUrl();
        search.pages = casper.evaluate(function(currentURL) {
            var pages = [];
            var total = document.querySelector(
                "div.search_results > span.showing > h3"
            ).textContent;
            total = total
                .split("of ")[1]
                .split(" Results")[0]
                .trim();
            var pageCnt = parseInt(total) / 10;

            if (pageCnt % 100 != 0) {
                pageCnt += 1;
            }

            pageCnt = parseInt(pageCnt);
            for (var i = 1; i <= pageCnt; i++) {
                pages.push(currentURL + "&Page=" + i);
            }

            return pages;
        }, currentURL);
    });

    this.then(function() {
        if (search.pages.length > 0) {
            qs.log(search.pages.length + " Total number of pages found");
        }
    });
}

function gatherLotsInfoFromEachPages() {
    qs.log(
        "There are " +
            (search.pages.length - search.currentPage) +
            " more pages of search results to scrape."
    );

    this.then(function() {
        if (search.pages.length > search.currentPage) {
            this.thenOpen(search.pages[search.currentPage]);

            this.then(function() {
                // To ensure the page will completely load
                var afterWait = function() {
                    // scrape all the lots info on the page
                    addLotToScrapeData.call(this);

                    this.then(function() {
                        if (scrapeData.moreLotsExist == true) {
                            // Increment the current search results page
                            search.currentPage++;

                            // Run this function again until there are no more catalogues
                            this.then(gatherLotsInfoFromEachPages);
                        }
                    });
                };

                this.then(function() {
                    this.waitForSelector("#results_list_wrap", afterWait);
                });
            });
        }
    });
}

/**
 * Add links
 *
 * This function evaluates the current page and looks for links to the data that
 * need to be scraped.  Scrape data links are added to `scrapeData.links`.  Later on, we will
 * loop through that array to gather the scrape data details from each page.
 */
function addLotToScrapeData() {
    this.then(function() {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var newLinks = this.evaluate(getLotInfo);
        scrapeData.links = scrapeData.links.concat(newLinks.filteredLinks);

        if (newLinks.hasLotsExist == false) {
            scrapeData.moreLotsExist = false;
        } else {
            qs.log(
                "Found " +
                    newLinks.filteredLinks.length +
                    " Total to scrape data: " +
                    scrapeData.links.length
            );
        }
    });
}

function getLotInfo() {
    var links = {
        filteredLinks: [],
        hasLotsExist: true
    };

    var elem = document.querySelectorAll(
        '#results_list_wrap > div.list_cars > ul > li > a[href*="/vehicle-detail.aspx"]'
    );
    for (var i = 0; i < elem.length; i++) {
        var lot_aution_date = elem[i].parentElement
            .querySelector('[class="date"]')
            .innerText.trim();
        // pull lots with aution date only
        if (lot_aution_date !== "-") {
            var lotlink = elem[i].href;
            links.filteredLinks.push({
                url: lotlink.replace("https", "http"),
                auction_date: lot_aution_date,
                fuel: __utils__
                    .getElementByXPath('//span[contains(text(),"FUEL TYPE")]')
                    .nextElementSibling.innerText.trim()
            });
        }
    }

    if (elem.length == 0) {
        links.hasLotsExist = false;
    }
    return links;
}

/**
 * Spider the details page
 *
 * This function used the array of collected links provided by `scrapeData.links` and
 * provides the logic needed to "loop" over (via recursion) the different lots.
 */
function spiderDetailsPage() {
    var url, lotData;
    this.then(function() {
        if (scrapeData.links[scrapeData.currentData]) {
            url = scrapeData.links[scrapeData.currentData].url;
            lotData = scrapeData.links[scrapeData.currentData] || {};

            this.thenOpen(url);

            // to ensure the page will completely load
            var afterWait = function() {
                // Collect all the lot data on that page
                this.then(function() {
                    gatherDetails.call(this, url, lotData);
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                });
            };

            this.then(function() {
                if (this.exists('[id*="carousel-selector"]'))
                    this.waitForSelector(
                        '[id*="carousel-selector"]',
                        afterWait
                    );
                else {
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                }
            });
        } else {
            qs.log(
                "Total lots found: " +
                    scrapeData.links.length +
                    "; Total lots scraped: " +
                    scrapeData.currentData
            );
        }
    });
}

/**
 * Gather the details page
 *
 * This is where the real data harvesting happens.  This method expects to be
 * ran once we've reached a details page.  It then uses the spider's
 * `parse` method to extract all the needed data.  Extracted
 * data is added to the `lotData` array.
 */
function gatherDetails(url, lotData) {
    this.then(function() {
        lotData = lotData || {};
        var finalUrl = url ? url : this.getCurrentUrl();

        // Collect job details
        var lotDetails = this.evaluate(parse, lotData);

        var lotStatus = this.currentHTTPStatus;

        if (this.currentHTTPStatus === 404) {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 404)", "ERROR");
        } else if (this.currentHTTPStatus === 500) {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 505)", "ERROR");
        } else if (lotDetails && lotDetails._error) {
            qs.log(
                " - Lot: " +
                    finalUrl +
                    " - " +
                    JSON.stringify(lotDetails._error),
                "ERROR"
            );
        } else {
            qs.log(" - Lot: " + finalUrl);
        }

        /*
            Apply some additional standard formatting to the raw lot data
         */
        lotDetails = {
            source: {
                url: finalUrl,
                date: new Date().toUTCString(),
                status: lotStatus
            },
            data: lotDetails
        };

        // Save the lotDetails directly to a file (rather than collect it in memory)
        qs.scrapeDataLog.saveData(lotDetails);
    });
}

function parse(lotData) {
    lot = {};

    try {
        function escapeHTML(value) {
            var map = {
                amp: "&",
                lt: "<",
                gt: ">",
                quot: '"',
                "#039": "'",
                nbsp: " "
            };
            return value.replace(/&([^;]+);/g, function(f, c) {
                return map[c];
            });
        }
        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        lot["name"] = document.querySelector("div.name").innerText.trim();

        var details = {};

        var content = document.querySelectorAll("td span.content");
        var title = document.querySelectorAll("td span.title");

        for (var indx = 0; indx < content.length; indx++) {
            details[title[indx].textContent.trim()] = content[
                indx
            ].textContent.trim();
        }

        //model
        if (details["MODEL:"]) {
            lot["model"] = details["MODEL:"];
        }

        //manufacturer
        if (details["MAKE:"]) {
            lot["manufacturer"] = details["MAKE:"];
        }

        //registration
        if (details["REGISTERED:"]) {
            lot["registration"] = details["REGISTERED:"];
        }

        //mileage
        if (details["MILEAGE:"]) {
            lot["mileage"] = details["MILEAGE:"];
        }

        //colour
        if (details["COLOUR:"]) {
            lot["colour"] = details["COLOUR:"];
        }

        //mot
        if (details["MOT:"]) {
            lot["mot"] = details["MOT:"];
        }

        //estimate
        if (details["AUCTIONEERS EST:"]) {
            lot["estimate"] = details["AUCTIONEERS EST:"];
        }

        //gearbox
        if (details["TRANSMISSION:"]) {
            lot["gearbox"] = details["TRANSMISSION:"];
        }

        //service_history
        if (details["SERVICE HISTORY:"]) {
            lot["service_history"] = details["SERVICE HISTORY:"];
        }

        //type
        if (details["TYPE:"]) {
            lot["type"] = details["TYPE:"];
        }

        lot["description"] = escapeHTML(
            document.querySelector('[class="info_table"]').innerHTML
        );

        try {
            lot["additional_info"] = document
                .querySelector(
                    "#ContentPlaceHolderDefault_BCAMasterContentPlaceHolder_ImageVehicleDetails_8_pnlAdditionalInfo"
                )
                .innerText.trim();
        } catch (ex) {}

        //additional
        lot["variant"] = details["VARIANT:"];
        lot["vat_status"] = details["VAT STATUS:"];
        lot["co2"] = details["CO2 EMISSIONS:"];
        lot["grade"] = details["GRADE:"];

        lot["images"] = [].slice
            .call(document.querySelectorAll('a[id*="carousel-selector"] img'))
            .map(function(img) {
                return img.src;
            })
            .filter(function(item, pos, self) {
                return self.indexOf(item) == pos;
            })
            .join(", ");

        lot = jQuery.extend({}, lot, lotData);
    } catch (err) {
        lot["_error"] = err.message;
    }

    return lot;
}

function linkSpiderEventListeners() {
    casper.on("resource.requested", function(requestData, request) {
        var skip = [
            "facebook",
            "twitter",
            "cdn.syndication",
            "linkedin",
            "google-analytics",
            "youtube",
            "player-en_US",
            "addthis_widget"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
