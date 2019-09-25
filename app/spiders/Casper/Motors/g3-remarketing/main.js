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
    .start("https://www.g3remarketing.co.uk/")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the catalogue links that we need to scrape
        */
        gatherAllCatalogueLinks.call(this);

        /*
            Step 2: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            qs.log("Navigate lots url and scrape data.");
            if (scrapeData.links.length > 0) {
                spiderDetailsPage.call(this);
            }
        });

        /*
            Step 3: finalize and send result to importer via API call
        */
        this.then(function() {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function gatherAllCatalogueLinks() {
    this.then(function() {
        qs.log("Gather All Catalogue Links if any.");
        this.waitForSelector(
            "#g3_MainContent_WeekSales",
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls = [];
                    var element = document.querySelectorAll(
                        'a[class*="btn-primary"][href*="vehicle-search.aspx?sale="]'
                    );

                    for (var i = 0; i < element.length; i++) {
                        var path = element[i].href;
                        var auctionDate = element[i].parentElement.parentElement
                            .querySelector("td")
                            .innerText.trim();

                        auction_urls.push({
                            url: path + "&pagesize=10",
                            auction_date: auctionDate
                        });
                    }

                    return auction_urls;
                });

                this.wait(3000);
                this.then(function() {
                    qs.log(auction_urls.length + " catalogues/auctions found");
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
    qs.log("Gather Search Pages From Every Auctions.");
    this.waitForSelector(
        '[class="moredetails"]',
        function() {
            this.then(function() {
                search.pages = this.evaluate(function() {
                    var pages = [];

                    pageCnt = parseInt(
                        document
                            .querySelector('[class="page-item last"] a')
                            .getAttribute("href")
                            .split("page=")[1]
                    );

                    for (var i = 1; i <= pageCnt; i++) {
                        pages.push('[class*="page-item next"] a');
                    }

                    return pages;
                });
            });

            this.then(function() {
                try {
                    qs.log(
                        search.pages.length + " Total number of pages found"
                    );
                } catch (ex) {
                    qs.log("0 Total number of pages found");
                }
                this.then(addLinksToScrapeData);
            });
        },
        function _onTimeout() {
            qs.log("No record on the page " + this.getCurrentUrl());
        }
    );
}

function gatherSearchResultLinks() {
    this.then(function() {
        if (search.pages && search.pages[search.currentPage + 1]) {
            qs.log(
                "There are " +
                    (search.pages.length - search.currentPage - 1) +
                    " more pages of search results to scrape."
            );

            var nextPageElem = search.pages[search.currentPage + 1];

            // Navigate catalogue url
            this.click(nextPageElem);

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
                    this.waitForSelector('[class="moredetails"]', afterWait);
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
    var elem = document.querySelectorAll('[class="moredetails"]');
    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;

        links.push({
            url: lotlink,
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
                this.waitForSelector("#g3_MainContent_Breadcrumb", afterWait);
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

        lot["name"] = document.querySelector('[class="h4like"]').innerText;
        lot["manufacturer"] = document.querySelector(
            '[class="h4like"]'
        ).innerText;
        lot["model"] = document.querySelector('[class="h4like"]').innerText;

        var elem = document.querySelectorAll(
            "#g3_MainContent_BulletedListSummary li"
        );

        if (elem.length >= 1) lot["colour"] = elem[0].innerText.trim();

        if (elem.length >= 2) lot["fuel"] = elem[1].innerText.trim();

        if (elem.length >= 3) lot["gearbox"] = elem[2].innerText.trim();

        if (elem.length >= 4) lot["type"] = elem[3].innerText.trim();

        if (elem.length >= 6) lot["mileage"] = elem[4].innerText.trim();

        if (elem.length >= 7) lot["co2"] = elem[5].innerText.trim();

        lot["description"] = document.querySelector("#vehdetright").innerText.trim();

        lot["images"] = [].slice
            .call(
                document.querySelectorAll(
                    'img[src*="/images/vehicles/thumbnail/"]'
                )
            )
            .map(function(img) {
                var image_src = img.src;
		return image_src.replace("thumbnail", "large");
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
            "user",
            "tracking1",
            "IsSaleLive",
            "crisp"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
