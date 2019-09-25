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

var search = {};

var auctionIdx = 0;
var auction_urls = [];

//var search = {};

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
    .start("http://www.woma.co.uk/auctions/")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the catalogue links that we need to scrape
        */
        gatherAllAuctionLinks.call(this);

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

function gatherAllAuctionLinks() {
    this.then(function() {
        qs.log("Gather All Catalogue Links if any.");
        this.waitForSelector(
            "#auctions-list",
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls = [];
                    var element = document.querySelectorAll(
                        'a[href*="/stock?sale="]'
                    );

                    for (var i = 0; i < element.length; i++) {
                        var path = element[i].href;
                        var auction_date = element[
                            i
                        ].parentElement.parentElement
                            .querySelector('[class="sale-code"]')
                            .nextElementSibling.innerText.trim();
                        auction_urls.push({
                            url: path,
                            auction_date: auction_date
                        });
                    }
                    return auction_urls;
                });
                this.then(function() {
                    qs.log(auction_urls.length + " catalogues/auctions found");
                    /*
                        Step 2: Loop through each auctions links and gather all the search results pages and lot links
                    */
                    processAuction.call(this);
                });
            },
            function _onTimeout() {
                qs.log("No record on the page " + this.getCurrentUrl());
            }
        );
    });
}

function processAuction() {
    if (auctionIdx < auction_urls.length) {
        search = {
            pages: [],
            currentPage: 0
        };

        qs.log("Navigate " + auction_urls[auctionIdx].url);
        this.thenOpen(auction_urls[auctionIdx].url);

        this.then(function() {
            this.wait(6000);
            gatherSearchPages.call(this);
        });

        this.then(function() {
            this.wait(5000);
            gatherSearchResultLinks.call(this);
        });
    }
}

function gatherSearchPages() {
    this.waitForSelector(
        '[class="loading"][style*="display: none;"]',
        function() {
            this.then(function() {
                qs.log("Gather Search Pages From Every Auctions.");

                var currentURL = this.getCurrentUrl();
                search.pages = this.evaluate(function(currentURL) {
                    var pages = [];
                    var total = __utils__
                        .getElementByXPath(
                            '//strong[contains(text(),"Vehicles in Sale")]'
                        )
                        .innerText.trim();
                    total = total.match(/Vehicles in Sale: (\d+)/)[1].trim();
                    var pageCnt = parseInt(total) / 25;
                    if (pageCnt % 100 != 0) {
                        pageCnt += 1;
                    }
                    pageCnt = parseInt(pageCnt);
                    for (var i = 1; i <= pageCnt; i++) {
                        pages.push(
                            currentURL +
                                "#All/All/All/0/All/All/l_ot/25?page=" +
                                i
                        );
                    }

                    return pages;
                }, currentURL);
            });

            this.then(function() {
                if (search.pages.length > 0) {
                    qs.log(
                        search.pages.length + " Total number of pages found"
                    );
                } else {
                    search.pages = [];
                    qs.log("No Results Found!");
                    auctionIdx++;
                    processAuction.call(this);
                }
            });
        },
        function _onTimeout() {
            qs.log("No lots on the page " + this.getCurrentUrl());
        }
    );
}

function gatherSearchResultLinks() {
    this.then(function() {
        if (search.pages[search.currentPage]) {
            qs.log(
                "There are " +
                    (search.pages.length - search.currentPage) +
                    " more pages of search results to scrape."
            );

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
                        afterWait,
                        function _onTimeout() {
                            qs.log(
                                "No lots on the page " + this.getCurrentUrl()
                            );
                        }
                    );
                });
            });
        } else {
            auctionIdx++;
            processAuction.call(this);
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

        var newLinks = this.evaluate(getLinks, auction_urls[auctionIdx]);
        scrapeData.links = scrapeData.links.concat(newLinks);

        qs.log(
            "Found " +
                newLinks.length +
                " links on page. Total to scrape data: " +
                scrapeData.links.length
        );
    });
}

function getLinks(auctionInfo) {
    var links = [];

    var elem = document.querySelectorAll('a[href*="/stock/details?ref="]');
    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;
        links.push({
            url: lotlink.split("&saleLocation")[0].trim(),
            auction_date: auctionInfo.auction_date
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
                this.waitForSelector("#page-container", afterWait);
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

        //name
        var lotname = document.querySelector("#carDetails").innerText.trim();

        lot["name"] = lotname;
        lot["manufacturer"] = lotname;
        lot["model"] = lotname;

        var details = {};
        var elem = document.querySelectorAll("td.carDetailLabel");

        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].innerText.trim();
            var value = elem[indx].nextElementSibling.innerText.trim();
            details[header] = value;
        }

        if (details["Reg Number"] && details["Registered"]) {
            lot["registration"] =
                details["Reg Number"] + " " + details["Registered"];
        }

        if (details["MOT"]) {
            lot["mot"] = details["MOT"];
        }

        if (details["Mileage Declaration"]) {
            lot["mileage"] = details["Mileage Declaration"];
        }

        if (details["Vehicle"]) {
            var engine_size = details["Vehicle"];
            if (engine_size.indexOf("cc") !== -1)
                lot["engine_size"] = engine_size
                    .split(" - ")[1]
                    .trim()
                    .split(" ")[0]
                    .trim();
        }

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
        lot["description"] = document.querySelector(".stockdetails").innerText;

        lot["images"] = [].slice
            .call(document.querySelectorAll('img[src*="/imageFolder/"]'))
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
            "google",
            "amazonaws",
            "spincar",
            "FMSearchGet",
            "swipetospin",
            "cloudflare",
            "user"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
