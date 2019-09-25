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
var baseURL = "http://www.bonhams.com/departments/MOT-CAR/";

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
        "http://www.bonhams.com/api/v1/search_json/?content=sale&date_range=future&department=MOT-CAR&exclude_departments=GEN&exclude_departments=SOMA&exclude_departments=SUN&exclude_departments=COL-GEN&exclude_departments=FUR&exclude_departments=FUR-GEN&exclude_departments=PIC-GEN&length=100&page=1&randomise=False"
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
            Step 2: Loop through each catalogue links and gather all the lot links that we need to scrape
        */
        gatherResultLinksFromCatalogues.call(this);

        /*
            Step 3: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() 
        {
            qs.log("Navigate lots url and scrape data.");

            if (scrapeData.links.length > 0) 
            {
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
        var apiData = JSON.parse(this.getPageContent());
        var auctions = apiData.model_results.sale.items;

        if(auctions.length > 1)
        {
            for (var i = 0; i < auctions.length; i++) 
            {
                auction_urls.push({
                    url:
                        "http://www.bonhams.com/api/v1/lots/" +
                        auctions[i].iSaleNo +
                        "/?category=list&department=MOT-CAR&minimal=false&page=1&length=1000"
                    // auction_date: auctions[i].fmt_date
                });
            }
        }
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
                var apiData = JSON.parse(this.getPageContent());

                if (apiData.lots.length == 0) 
                {
                    qs.log("no lots in this catalogue");
                    auctionIdx++;
                    this.then(gatherResultLinksFromCatalogues);
                } 
                else 
                {
                    addLinksToScrapeData.call(this, apiData);

                    auctionIdx++;
                    this.then(gatherResultLinksFromCatalogues);
                }
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
function addLinksToScrapeData(apiData) {
    this.then(function() {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var detailIndex = 0;
        var newLinks = [];
        for (var i = 0; i < apiData.lots.length; i++) {
            var prices;
            if (apiData.lots[i].high_low_estimates)
                prices = apiData.lots[i].high_low_estimates.prices;
            else prices = apiData.lots[i].hammer_prices.prices;
            var price = undefined;
            if (prices.length) {
                var price = prices[0];
            }

            if (price) {
                price = price.currency + "" + price.low + " - " + price.high;
            }

            newLinks.push({
                url: "http://www.bonhams.com" + apiData.lots[i].url,
                //name: apiData.lots[detailIndex].image.alt.split(".")[0],
                //auction_date: auction_urls[auctionIdx].auction_date,
                name: apiData.lots[i].sDesc,
                auction_date: apiData.lots[i].fmt_date,
                estimate: price
            });
        }

        scrapeData.links = scrapeData.links.concat(newLinks);

        qs.log(
            "Found " +
                newLinks.length +
                " links on page. Total to scrape data: " +
                scrapeData.links.length
        );
    });
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
                this.waitForSelector(".LotDetail", afterWait);
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

        var description = "";
        var lotDesc = document.querySelector(".LotDesc");
        var lotDetails = document.querySelector('[class="LotName"]');
        if (lotDesc) {
            description += lotDesc.innerHTML;
        }

        if (lotDetails) {
            description += lotDetails.innerHTML;
        }

        var footNotesList = document.querySelector("#footnotes_list");
        if (footNotesList) {
            description += "<br />" + footNotesList.innerHTML;
        }
        description = description.trim();
        if (!(description == "" || description == "<br />")) {
            lot["description"] = description;
        }

        lot["images"] = [].slice
            .call(document.querySelectorAll("img.autogallery.clickable"))
            .map(function(img) {
                var src = img.getAttribute("src");
                src = src.split("?");
                var params = src[1].split("&");
                for (var i = 0; i < params.length; i++) {
                    if (params[i].indexOf("src") == 0) {
                        src = src[0] + "?" + params[i];
                        break;
                    }
                }
                return src;
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
            "addthis_widget",
            ".js"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
