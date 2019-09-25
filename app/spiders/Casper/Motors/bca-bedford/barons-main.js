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

casper
    .start("http://www.barons-auctions.com/auctionlist.aspx")
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
            Step 2: Loop through each catalogue links and gather all the lot links that we need to scrape
        */
        gatherResultLinksFromCatalogues.call(this);

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
            'article[class*="entry entry-simple"]',
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls = [];
                    var elem = document.querySelectorAll(
                        'article[class*="entry entry-simple"]'
                    );

                    for (var x = 0; x < elem.length; x++) {
                        var auction_name = elem[x]
                            .querySelector('h2 a[href*="/view-auction/"]')
                            .innerText.trim();
                        var auction_url = elem[x].querySelector(
                            'h2 a[href*="/view-auction/"]'
                        ).href;
                        var auctionDate = elem[x]
                            .querySelector('h2 a[href*="/view-auction/"]')
                            .href.split("/view-auction/")[1]
                            .split("/")[1]
                            .split("---")[0]
                            .trim();

                        var date = new Date(Date.now());
                        var today =
                            date.getMonth() +
                            1 +
                            "/" +
                            date.getDate() +
                            "/" +
                            date.getFullYear();

                        if (new Date(auctionDate) >= new Date(today)) {
                            auction_urls.push({
                                auction_name: auction_name,
                                auction_date: auctionDate,
                                url: auction_url
                            });
                        }
                    }

                    return auction_urls;
                });
            }
        );
    });

    this.then(function() {
        qs.log(auction_urls.length + " Total catatalogues found.");
    });
}

function gatherResultLinksFromCatalogues() {
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
                        if (scrapeData.links.length > 0) {
                            // Run this function again until there are no more catalogues
                            this.then(gatherResultLinksFromCatalogues);
                        } else {
                            qs.log("No Results Found!");
                        }
                    });
                };

                this.then(function() {
                    this.waitForSelector('[id="objCars"]', afterWait);
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

    var elem = document.querySelectorAll(
        '[id="objCars"] article[class="entry"]'
    );

    var auctionDate = auctionInfo.auction_date;
    for (var i = 0; i < elem.length; i++) {
        var lotnum = elem[i]
            .querySelector('[class="entry-date"]')
            .innerText.replace("\n", " ")
            .trim();
        var lot_url = elem[i].querySelector('h2 [href*="/view-lot/"]').href;
        var lotname = elem[i]
            .querySelector('h2 [href*="/view-lot/"]')
            .innerText.trim();

        links.push({
            url: lot_url,
            lot_num: lotnum,
            name: lotname,
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
                this.waitForSelector('[id="content"]', afterWait);
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
        var elem = document
            .querySelectorAll('[class*="row auction-lot-data-grid"]')[0]
            .querySelectorAll("tr");
        for (var indx = 0; indx < elem.length; indx++) {
            if (elem[indx].innerText.split(":").length == 2) {
                var header = elem[indx].innerText.split(":")[0].trim();
                var value = elem[indx].innerText.split(":")[1].trim();
            }
            details[header] = value;
        }

        lot['registration'] = '---';
        lot['mileage'] = '---';
        lot['gearbox'] = '---';
        lot['fuel'] = '---';
        lot['colour'] = '---';
        lot['mot'] = '---';
	lot['service_history'] = "---";
	lot['engine_size'] = '---';
	lot['type'] = '---';
	lot['additional_info'] = details['Colour'];
	lot["description"] = '---';

        //model
        if (details["Manufacturer"]) {
            lot["manufacturer"] = details["Manufacturer"];
        }

        //model
        if (details["Model"]) {
            lot["model"] = details["Model"];
        }

        //model
        if (details["Mileometer"]) {
            lot["mileage"] = details["Mileometer"];
        }

        //model
        if (details["Colour"]) {
            lot["colour"] = details["Colour"];
        }

        //model
        if (details["MOT"]) {
            lot["mot"] = details["MOT"];
        }

        //model
        if (details["Registration No"]) {
            lot["registration"] = details["Registration No"];
        }

        lot["estimate"] = document
            .querySelector('[class="product-price-container"]')
            .innerText.replace("Guide Price:", "")
            .trim();

        //description
        var description = "";
        description +=
            document.querySelector('[class="page-header-desc"]').innerHTML +
            "<br/><br/>";
        description += document.querySelector('[class="mb50"]')
            .previousElementSibling.innerHTML;
        lot["description"] = description;

        lot["auction_date"] = lotData.auction_date;

        lot["images"] = [].slice
            .call(document.querySelectorAll('[class*="product-gallery"] img'))
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

    casper.on("resource.requested", function(requestData, request) {
        if (!(requestData.url.indexOf("barons-auctions") > -1)) {
            request.abort();
        }
    });
}
