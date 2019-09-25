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
    currentData: 0
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
    .start("http://www2.amstock.co.uk/husseys/Stock.aspx?type=car")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the auction search pages
        */
        gatherAllAuctionPages.call(this);

        /*
            Step 2: Loop through each search pages  and gather all lot links and data
        */
        gatherSearchResultLinks.call(this);

        /*
            Step 3: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            qs.log("Navigate lots url and scrape data.");
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

function gatherAllAuctionPages() {
    this.then(function() {
        qs.log("Gather All Auction Pages.");
        var currentURL = this.getCurrentUrl();
        this.waitForSelector(
            '[class="page selected"]',
            function() {
                search.pages = this.evaluate(function(currentURL) {
                    var pages = [];
                    var total = document.querySelectorAll(
                        "#ctl00_ContentPlaceHolder1_gvStock > tbody > tr:nth-child(1) > td > table td"
                    );

                    for (var i = 1; i <= total.length; i++) {
                        pages.push(i);
                    }

                    return pages;
                }, currentURL);

                this.then(function() {
                    qs.log(
                        search.pages.length + " Total number of pages found"
                    );
                });

                this.then(addLinksToScrapeData);
            },
            function _onTimeout() {
                qs.log("No pages found", this.getCurrentUrl());
                this.then(addLinksToScrapeData);
            }
        );
    });
}

function gatherSearchResultLinks() {
    this.then(function() {
        if (search.pages[search.currentPage + 1]) {
            qs.log(
                "There are " +
                    (search.pages.length - search.currentPage - 1) +
                    " more pages of search results to scrape."
            );

            // Navigate search page url
            var indx = search.pages[search.currentPage] + 1;
            this.evaluate(function(indx) {
                var theForm = document.forms["aspnetForm"];
                if (!theForm) {
                    theForm = document.aspnetForm;
                }
                function __doPostBack(eventTarget, eventArgument) {
                    if (!theForm.onsubmit || theForm.onsubmit() != false) {
                        theForm.__EVENTTARGET.value = eventTarget;
                        theForm.__EVENTARGUMENT.value = eventArgument;
                        theForm.submit();
                    }
                }

                __doPostBack(
                    "ctl00$ContentPlaceHolder1$gvStock",
                    "Page$" + indx
                );
            }, indx);

            this.then(function() {
                // To ensure the page will completely load
                var afterWait = function() {
                    // Collect all the links to scrape data on the page
                    addLinksToScrapeData.call(this);

                    this.then(function() {
                        // Increment the current search results page
                        search.currentPage++;

                        // Run this function again until there are no more catalogues
                        this.then(gatherSearchResultLinks);
                    });
                };

                this.then(function() {
                    this.waitForSelector(".stockPagination", afterWait);
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
function addLinksToScrapeData() {
    this.then(function() {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var newLinks = this.evaluate(getLinks);

        scrapeData.links = scrapeData.links.concat(newLinks);

        qs.log(
            "Found " +
                newLinks.length +
                " links on page. Total to scrape data: " +
                scrapeData.links.length
        );
    });
}

function getLinks() {
    var links = [];

    var elem = document.querySelectorAll('[href*="/stock/details?ref="]');
    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;
        links.push({
            url: lotlink,
            auction_date: document
                .querySelector('[id="sale-details"]')
                .innerText.split("\n")[1]
                .split("-")[1]
                .trim()
        });
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
                this.waitForSelector('[class="stockDetail"]', afterWait);
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

        var details = {};
        var elem = document.querySelectorAll("#detailsTable div");
        for (var indx = 0; indx < elem.length; indx++) {
            try {
                var header = elem[indx].children[0].innerText
                    .replace(":", "")
                    .trim();
                if (header == "Former Keepers") {
                    break;
                }
                var value = "";
                if (elem[indx].children[1]) {
                    value = elem[indx].children[1].innerText.trim();
                }
                details[header] = value;
            } catch (err) {}
        }

        //name
        lot["name"] = document
            .querySelector('[class="stockDetail"] h3')
            .innerText.trim();

        lot["manufacturer"] = document
            .querySelector('[class="stockDetail"] h3')
            .innerText.trim();

        lot["model"] = document
            .querySelector('[class="stockDetail"] h3')
            .innerText.trim();

        //registration
        lot["registration"] =
            details["Registration"] + " " + details["Registered"];

        //mileage
        if (details["Odometer"]) {
            lot["mileage"] = details["Odometer"];
        }

        //mot
        if (details["MOT"]) {
            lot["mot"] = details["MOT"];
        }

        //colour
        if (details["Colour"]) {
            lot["colour"] = details["Colour"];
        }

        //type
        if (details["Type"]) {
            lot["type"] = details["Type"];
        }

        //fuel
        if (details["Fuel Type"]) {
            lot["fuel"] = details["Fuel Type"];
        }

        //gear
        if (details["Transmission"]) {
            lot["gearbox"] = details["Transmission"];
        }

        //additional fields
        if (details["VAT Status"]) {
            lot["vat"] = details["VAT Status"];
        }

        //description
        lot["description"] = document.querySelector("#detailsTable").innerText;

        lot["images"] = [].slice
            .call(document.querySelectorAll('img[class="ug-thumb-image"]'))
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

function linkSpiderEventListeners() {}
