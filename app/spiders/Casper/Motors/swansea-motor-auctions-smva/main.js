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
    .start("http://www.smva.co.uk/stock")
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
        this.waitForSelector(
            "#gvStock",
            function() {
                var currentURL = this.getCurrentUrl();
                search.pages = this.evaluate(function(currentURL) {
                    var pages = [];
                    var total = __utils__
                        .getElementByXPath(
                            '//strong[contains(text(),"Vehicles in Sale")]'
                        )
                        .innerText.trim();
                    total = total.match(/Vehicles in Sale: (\d+)/)[1].trim();
                    var pageCnt = parseInt(total) / 10;
                    if (pageCnt % 100 != 0) {
                        pageCnt += 1;
                    }
                    pageCnt = parseInt(pageCnt);
                    for (var i = 1; i <= pageCnt; i++) {
                        pages.push(
                            currentURL + "#All/All/0/All/All/l_ot?page=" + i
                        );
                    }

                    return pages;
                }, currentURL);
                this.then(function() {
                    qs.log(
                        search.pages.length + " Total number of pages found"
                    );
                });
            },
            function _onTimeout() {
                qs.log("No record on the page " + this.getCurrentUrl());
            }
        );
    });
}

function gatherSearchResultLinks() {
    this.then(function() {
        qs.log(
            "There are " +
                (search.pages.length - search.currentPage) +
                " more pages of search results to scrape."
        );
        if (search.pages[search.currentPage]) {
            // Navigate search page url
            this.thenOpen(search.pages[search.currentPage]);

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
                    this.waitForSelector(
                        '[class="loading"][style*="display: none;"]',
                        afterWait
                    );
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

    var elem = document.querySelectorAll('a[href*="/stock/details?ref="]');

    var date = __utils__
        .getElementByXPath('//strong[contains(text(),"Date:")]')
        .innerText.trim();
    var date_split = date.split(" ");
    date = date_split[1] + " " + date_split[2] + " " + date_split[3];

    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;

        links.push({
            url: lotlink,
            auction_date: date
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
                this.waitForSelector(".stockdetails", afterWait);
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

        var lotname = document
            .querySelector("div.stockdetailwrap p")
            .innerText.replace("Back to results", "")
            .trim();

        lot["name"] = lotname;
        lot["manufacturer"] = lotname;
        lot["model"] = lotname;

        lot['auction_date'] = lotData.auction_date;

        var details = {};
        var elem = document.querySelectorAll(".stockdetails table tr");

        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].children[0].innerText
                .replace(":", "")
                .trim();
            if (elem[indx].children.length == 2) {
                var value = elem[indx].children[1].innerText.trim();
                details[header] = value;
            }
        }

        try {
            if (details["Registered"]) {
                lot["registration"] = details["Registered"];
            }

            if (details["MOT / Location"]) {
                lot["mot"] = details["MOT / Location"];
            }

            if (details["Mileage"]) {
                lot["mileage"] = details["Mileage"];
            }
        } catch (err) {}

        if (details["Description"]) {
            var colour = null;

            if (details["Description"].indexOf("Manual") > -1) {
                colour = details["Description"].split("Manual");
                if (colour.length >= 2) {
                    lot["colour"] = colour[0].trim();
                }
            } else if (details["Description"].indexOf("Automatic") > -1) {
                colour = details["Description"].split("Automatic");
                if (colour.length >= 2) {
                    lot["colour"] = colour[0].trim();
                }
            } else {
                colour = details["Description"].split(" ");
                if (colour.length >= 2) {
                    lot["colour"] = colour[0].trim();
                }
            }
        }

        if (details["Guide Value"]) {
            lot["estimate"] = details["Guide Value"];
        }

        //fuel
        if (
            details["Description"].indexOf("petrol") > -1 ||
            details["Description"].indexOf("Petrol") > -1
        ) {
            lot["fuel"] = "Petrol";
        } else if (
            details["Description"].indexOf("diesel") > -1 ||
            details["Description"].indexOf("Diesel") > -1
        ) {
            lot["fuel"] = "Diesel";
        }

        //gearbox
        if (
            details["Description"].indexOf("manual") > -1 ||
            details["Description"].indexOf("Manual") > -1
        ) {
            lot["gearbox"] = "Manual";
        } else if (
            details["Description"].indexOf("automatic") > -1 ||
            details["Description"].indexOf("Automatic") > -1
        ) {
            lot["gearbox"] = "Automatic";
        }

        lot["lot_num"] = details["details"];

        //description
        lot["description"] = document.querySelector(".stockdetails").innerHTML;

        lot["images"] = [].slice
            .call(document.querySelectorAll("div.es-carousel img"))
            .map(function(img) {
                return img.src;
            })
            .filter(function(item, pos, self) {
                return self.indexOf(item) == pos;
            })
            .join(", ");
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
