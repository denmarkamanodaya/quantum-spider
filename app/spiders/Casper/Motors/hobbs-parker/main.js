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

casper.userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)");

/**
 * Initialize any spider event listeners
 */
linkSpiderEventListeners();

casper
    .start(
        "https://www.hobbsparker.co.uk/car-auctions/auction-dates/?companyId=4"
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
            '.bottom-actions a[title="view sale catalogue"]',
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls = [];
                    var element = document.querySelectorAll('.bottom-actions a[title="view sale catalogue"]');
			
                    for (var i = 0; i < element.length; i++) {
			    
                        var auctionDate = element[i].parentNode.parentNode.parentNode
                            .querySelector('[class="auction-item-date hp-blue"] time')
                            .getAttribute("data-auction-date"); 

                        auction_urls.push({
                            url: element[i].href
                            ,auction_date: auctionDate
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
                    this.waitForSelector('[class*="featured-lot"]', afterWait);
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
    var element = document.querySelectorAll('[class*="featured-lot"]');

    for (var i = 0; i < element.length; i++) {
        try {
            var path = element[i].querySelector('a[href*="lotId"]').href;

            links.push({
                url: path,
                auction_date: auctionInfo.auction_date
            });
        } catch (ex) {}
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
                    '[class="row item-detail item-detail-flex"]',
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

        var lotname = document
            .querySelector('[class*="flex-item-md-first"] h3')
            .innerText.split("\n")[0]
            .trim();

        //name
        lot["name"] = lotname;

        var details = {};
        var elem = document.querySelectorAll("dt");

        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].innerText.trim();
            var value = elem[indx].nextElementSibling.innerText.trim();
            details[header] = value;
        }

        if (details["Gearbox:"]) {
            //gearbox
            lot["gearbox"] = details["Gearbox:"];
        }

        if (details["Make:"]) {
            //make
            lot["manufacturer"] = details["Make:"];
        }

        if (details["Fuel Type:"]) {
            //fuel
            lot["fuel"] = details["Fuel Type:"];
        }

        if (details["Model:"]) {
            //model
            lot["model"] = details["Model:"];
        }

        if (details["Mileage:"]) {
            //mileage
            lot["mileage"] = details["Mileage:"];
        }

        if (details["MOT Until:"]) {
            //mileage
            lot["mot"] = details["MOT Until:"];
        }

        var lotNameVal = lotname.split("/");

        var colour = lotNameVal[lotNameVal.length - 2].trim();
        lot["colour"] = colour;

        var type = lotNameVal[lotNameVal.length - 3].trim();
        lot["type"] = type;

        var engine_size = lotNameVal[lotNameVal.length - 1].trim();
        lot["engine_size"] = engine_size;

        //description
        lot["description"] = document.querySelector(
            '[class*="lot-view-flex-wrapper"]'
        ).innerText;

        lot["images"] = [].slice
            .call(
                document.querySelectorAll(
                    'img[data-selector="standard-gallery-thumb"]'
                )
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

    casper.on("resource.requested", function(requestData, request) {
        if (!(requestData.url.indexOf("hobbsparker") > -1)) {
            request.abort();
        }
    });
}
