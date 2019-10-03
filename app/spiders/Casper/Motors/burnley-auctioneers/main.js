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

casper.userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36");

casper
    .start(
        "https://www.burnleyauctioneers.co.uk/index.php/next-sale/plant-machinery-hgv-light-commercial-auction"
    )
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
            Step 2: Loop through each catalogue links and gather all the search results links that we need to scrape
        */
        gatherSearchResultLinksFromCatalogues.call(this);

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

function gatherAllCatalogueLinks() {
    this.then(function() {
        qs.log("Gather All Catalogue Links if any.");
        this.waitForSelector(
            '[id="gkComponent"]',
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls = [];
                    var elem = document.querySelectorAll(
                        '[id="gkComponent"] [href*="/index.php/next-sale/"]'
                    );
                    var aucDate = document
                        .querySelector('[class="breadcrumbs"] [class="last"]')
                        .innerText.split("-")[1]
                        .trim();

                    for (var x = 0; x < elem.length; x++) {
                        var auction_name = elem[x].innerText.trim();
                        var auction_url = elem[x].href;
                        var auctionDate = aucDate;

                        auction_urls.push({
                            auction_name: auction_name,
                            auction_date: auctionDate,
                            url: auction_url
                        });
                    }

                    return auction_urls;
                });

                this.then(function() {
                    qs.log(auction_urls.length + " catalogues/auctions found");
                });
            },
            function _onTimeout() {
                qs.log("No record on the page " + this.getCurrentUrl());
            }
        );
    });
}

function gatherSearchResultLinksFromCatalogues() {
    this.then(function() {
        if (auctionIdx < auction_urls.length && auction_urls[auctionIdx]) {
            qs.log("Navigate catalogue: " + auction_urls[auctionIdx].url);

            // Navigate catalogue url
            this.thenOpen(auction_urls[auctionIdx].url);

            this.then(function() {
                // To ensure the page will completely load
                var afterWait = function() {
                    // Collect all the links to scrape data on the page
                    addLinksToScrapeData.call(this);

                    this.then(function() {
                        // Increment the current search results page
                        auctionIdx++;

                        // Run this function again until there are no more catalogues
                        this.then(gatherSearchResultLinksFromCatalogues);
                    });
                };

                this.then(function() {
                    this.waitForSelector('[class="browse-view"]', afterWait);
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

        var newLinks = casper.evaluate(getLinks, auction_urls[auctionIdx]);

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

    var elem = document.querySelectorAll(
        '[class="browse-view"] h2 a[href*="/index.php/next-sale/"]'
    );
    for (var i = 1; i < elem.length; i++) {
        var lot_url = elem[i].href;
        var lotname = elem[i].innerText.trim();

        links.push({
            url: lot_url,
            name: lotname,
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
                this.waitForSelector('[id="gkComponent"]', afterWait);
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

        lot["manufacturer"] = lotData.name;
        lot["model"] = lotData.name;

        //description
        try {
            var description = document.querySelector(
                '[class="product-description"]'
            ).innerHTML;
            lot["description"] = description.replace("Description", "");
        } catch (err) {}

        lot["images"] = [].slice
            .call(
                document.querySelectorAll(
                    '[class="MagicToolboxSelectorsContainer"] a'
                )
            )
            .map(function(a) {
                return a.href;
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
