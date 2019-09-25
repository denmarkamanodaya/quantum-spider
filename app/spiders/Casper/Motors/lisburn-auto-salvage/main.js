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

var auctionDate = "";

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
    .start("https://auction.lisburnautosalvage.co.uk/")
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
    qs.log("Gather All Search pages if any.");
    this.then(function() {
        this.waitForSelector(
            '[class*="galleryContainer"] [class="galleryTitle"]',
            function() {
                search.pages = casper.evaluate(function() {
                    var pages = [];

                    var pageCnt = parseInt(100);

                    for (var i = 0; i < pageCnt; i++) {
                        pages.push(
                            "https://auction.lisburnautosalvage.co.uk/Browse?page=" +
                                i
                        );
                    }

                    return pages;
                });

                casper.then(function() {
                    qs.log(
                        search.pages.length + " Default number of pages set."
                    );
                });
            },
            function _onTimeout() {
                qs.log("No lots on the catalogue " + this.getCurrentUrl());
            }
        );
    });
}

function gatherLotsInfoFromEachPages() {
    this.then(function() {
        if (search.pages[search.currentPage]) {
            qs.log("Navigate page " + search.pages[search.currentPage]);

            this.thenOpen(search.pages[search.currentPage]);

            // Navigate catalogue url

            this.then(function() {
                // To ensure the page will completely load
                var afterWait = function() {
                    // scrape all the lots info on the page
                    addLotToScrapeData.call(this);

                    this.then(function() {
                        // Increment the current search results page
                        search.currentPage++;

                        // Run this function again until there are no more catalogues
                        this.then(gatherLotsInfoFromEachPages);
                    });
                };

                this.then(function() {
                    this.waitForSelector(
                        '[class*="galleryContainer"] [class="galleryTitle"]',
                        afterWait,
                        function _onTimeout() {
                            qs.log(
                                "No lots on the catalogue " +
                                    this.getCurrentUrl()
                            );
                        }
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
function addLotToScrapeData() {
    this.then(function() {
        var newLotInfo = [];

        newLotInfo = this.evaluate(getLotInfo, auctionDate);
        scrapeData.links = scrapeData.links.concat(newLotInfo);

        qs.log(
            "Found " +
                newLotInfo.length +
                " Total to scrape data: " +
                scrapeData.links.length
        );
    });
}

function getLotInfo(auction_date) {
    var links = [];

    var elem = document.querySelectorAll(
        '[class*="galleryContainer"] [class="galleryTitle"]'
    );

    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].querySelector('[href*="/Listing/Details/"]').href;
        var lot_name = elem[i]
            .querySelector('[href*="/Listing/Details/"]')
            .innerText.trim();
        var lot_estimate = elem[i].parentNode
            .querySelector('[class*="galleryPrice"]')
            .innerText.trim();

        links.push({
            url: lotlink,
            name: lot_name,
            lot: lot_estimate
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
                this.waitForSelector(
                    '[class*="detail__title__wrapper"]',
                    afterWait
                );
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
        var elem = document.querySelectorAll(
            'ul[class*="detail__custom-fields"] li'
        );

        for (var indx = 0; indx < elem.length; indx++) {
            try {
                var header = elem[indx]
                    .querySelector('[class*="detail__field-name"]')
                    .innerText.trim();
                var value = elem[indx]
                    .querySelector('[class*="detail__field-value"]')
                    .innerText.trim();

                details[header] = value;
            } catch (err) {}
        }

        if (details["Make"]) {
            lot["manufacturer"] = details["Make"];
        }

        if (details["Model"]) {
            lot["model"] = details["Model"];
        }

        if (details["Colour"]) {
            lot["colour"] = details["Colour"];
        }

        if (details["Transmission"]) {
            lot["gearbox"] = details["Transmission"];
        }

        if (details["Fuel Type"]) {
            lot["fuel"] = details["Fuel Type"];
        }

        if (details["MOT Expiry"]) {
            lot["mot"] = details["MOT Expiry"];
        }

        if (details["Date First Registered"]) {
            lot["registration"] = details["Date First Registered"];
        }

        if (details["Speedo"]) {
            lot["mileage"] = details["Speedo"];
        }

        if (details["Mileage"]) {
            lot["mileage"] = details["Mileage"];
        }

        if (details["Body Type"]) {
            lot["type"] = details["Body Type"];
        }

        if (details["Engine Size"]) {
            lot["engine_size"] = details["Engine Size"];
        }

        try {
            lot["description"] = document.querySelector(
                '[class*="detail__data-panel"]'
            ).innerHTML;
        } catch (ex) {}

        lot["images"] = [].slice
            .call(
                document.querySelectorAll('img[src*="Content/listingImages/"]')
            )
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
