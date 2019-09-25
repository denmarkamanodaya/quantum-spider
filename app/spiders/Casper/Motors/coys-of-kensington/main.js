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

var search = {};

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
    .start("http://www.coys.co.uk/upcoming-auctions")
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
        auction_urls = this.evaluate(function() {
            var urls = [];
            //var anchors = document.querySelectorAll('div.content-area.lgrey a');  //all auctions - no lots available in other auctions as on 4th dec 2016
            var anchors = document.querySelectorAll(
                '[id="main"] a[href*="http://www.coys.co.uk/"][title="View auction details"]'
            ); //upcoming auctions
            for (var i = 0; i < anchors.length; i++) {
                if (urls.indexOf(anchors[i].href) == -1) {
                    urls.push({
                        url: anchors[i].href
                    });
                }
            }
            return urls;
        });

        this.then(function() {
            qs.log(auction_urls.length + " catalogues/auctions found");
            /*
                Step 2: Loop through each auctions links and gather all the search results pages and lot links
            */
            processAuction.call(this);
        });
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
        ".navrechts",
        function() {
            this.then(function() {
                search.pages = this.evaluate(function() {
                    var pages = [];
                    var elem = document
                        .querySelector(".navrechts")
                        .querySelectorAll("a");

                    for (var i = 0; i < elem.length; i++) {
                        if (!elem[i].classList.contains("selected")) {
                            pages.push(elem[i].href);
                        }
                    }

                    return pages;
                });
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
            search.pages = [];
            qs.log("No Results Found!");
            auctionIdx++;
            processAuction.call(this);
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

            // Navigate catalogue url
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
                    this.waitForSelector(".navrechts", afterWait);
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
    var elem = document.querySelectorAll("article");

    var auctionDate = "";
    var catalogue_properties = document.querySelectorAll(
        "table.shop_attributes th"
    );
    var catalogue_values = document.querySelectorAll(
        "table.shop_attributes td"
    );
    for (var i = 0; i < catalogue_properties.length; i++) {
        var key = catalogue_properties[i].innerText.toLowerCase();
        if (key == "date") {
            auctionDate = catalogue_values[i].innerText.trim();
        }
    }

    for (var i = 0; i < elem.length; i++) {
        links.push({
            url: elem[i].querySelector("a").href,
            auction_date: auctionDate
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
                this.waitForSelector("header.entry-header", afterWait);
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

        var dts = document
            .querySelectorAll("header.entry-header table")[1]
            .querySelectorAll("th");
        var dds = document
            .querySelectorAll("header.entry-header table")[1]
            .querySelectorAll("td");

        for (var i = 0; i < dts.length; i++) {
            var key = dts[i].innerText.toLowerCase();
            if (key.trim() == "model") {
                lot["model"] = dds[i].innerText.trim();
            }

            if (key.trim() == "make") {
                lot["manufacturer"] = dds[i].innerText.trim();
            }

            if (key.trim() == "reg. number") {
                lot["registration"] = dds[i].innerText.trim();
            }

            if (key.trim() == "Lot Number") {
                lot["lot_num"] = dds[i].innerText.trim();
            }
        }

        lot["estimate"] = document
            .querySelector("header.entry-header h2")
            .innerText.trim()
            .replace("\n", "")
            .replace("- ", "-")
            .replace("ESTIMATE", "")
            .replace("estimate", "")
            .replace("Estimate", "")
            .trim();

        var description = document.querySelector('[class="entry-content"] p')
            .innerHTML;

        var descElem = document.querySelectorAll('[class="shop_attributes"]');
        for (var i = 0; i < descElem.length; i++) {
            description += "<br/><br/>" + descElem[i].innerHTML;
        }
        lot["description"] = description;

        lot["name"] = document
            .querySelector(".product-title h1")
            .innerHTML.trim()
            .split("-")[1]
            .trim();

        lot["images"] = [].slice
            .call(document.querySelectorAll(".slider-box img.ms-thumb"))
            .map(function(img) {
                var src = img.getAttribute("src");
                var splitThumbInit = src.lastIndexOf("-");
                var splitThumbEnd = src.lastIndexOf(".");
                return (
                    src.substring(0, splitThumbInit) +
                    src.substring(splitThumbEnd, src.length)
                );
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
