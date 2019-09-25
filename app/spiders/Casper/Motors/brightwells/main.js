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
    .start("https://www.brightwells.com/classic-motoring/")
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
        auction_urls = this.evaluate(function() {
            var urls = [];
            var anchors = document.querySelectorAll("a.mobile-hidden");
            for (var i = 0; i < anchors.length; i++) {
                var url = anchors[i].href;
                if (
                    url.indexOf("/classic-motoring/") != -1 &&
                    !(
                        anchors[i].title.indexOf("How To Buy") != -1 ||
                        anchors[i].title.indexOf("Past Results") != -1
                    )
                ) {
                    if (urls.indexOf(url) == -1) {
                        console.log(url);
                        urls.push(url);
                    }
                }
            }
            return urls;
        });
    });

    this.then(function() {
        qs.log(auction_urls.length + " Total catatalogues found.");
    });
}

function gatherResultLinksFromCatalogues() {
    this.then(function() {
        if (auctionIdx < auction_urls.length && auction_urls[auctionIdx]) {
            qs.log("Navigate catalogue: " + auction_urls[auctionIdx]);

            // Navigate catalogue url
            this.thenOpen(auction_urls[auctionIdx]);

            this.then(function() {
                if (this.exists('[title="Catalogue"]')) {
                    this.waitForSelector('[title="Catalogue"]', function() {
                        this.click('[title="Catalogue"]');

                        this.waitForSelector("table tr.js_lotinfo", function() {
                            this.then(function() {
                                try {
                                    addLinksToScrapeData.call(this);
                                    auctionIdx++;
                                    this.then(gatherResultLinksFromCatalogues);
                                } catch (ex) {
                                    auctionIdx++;
                                    this.then(gatherResultLinksFromCatalogues);
                                    qs.log("No lots found.");
                                }
                            });
                        });
                    });
                } else {
                    auctionIdx++;
                    this.then(gatherResultLinksFromCatalogues);
                    qs.log("No lots found.");
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
function addLinksToScrapeData() {
    this.then(function() {
        this.sendKeys('[id="modal-mailinglist"]', this.page.event.key.Escape);

        this.wait(20000);
    });

    this.then(function() {
        var currentUrl = this.getCurrentUrl();
        qs.log("Scraping search results page: " + currentUrl);
        var newLinks = this.evaluate(function(currentUrl) {
            var lotIds = document.querySelectorAll("table tr.js_lotinfo");
            var links = [];

            var auctionDate = document
                .querySelector(
                    "div.main-content.has-sidebar > div > div > h2:nth-child(4) > strong"
                )
                .innerHTML.split(",")[0];
            if (!auctionDate) {
                var auctionDate = document
                    .querySelector("h1")
                    .innerHTML.split("Catalogue")[0];
            }

            for (var i = 0; i < lotIds.length; i++) {
                var lotid = lotIds[i].getAttribute("data-lotid").trim();
                var rawimages = lotIds[i]
                    .querySelectorAll("td")[0]
                    .querySelector("img").src;
                var rawname = lotIds[i]
                    .querySelectorAll("td")[2]
                    .innerText.trim();
                var rawdescription = lotIds[i]
                    .querySelectorAll("td")[4]
                    .innerText.trim();
                var rawprice = lotIds[i]
                    .querySelectorAll("td")[5]
                    .innerText.trim();
                var rawurl = currentUrl + "?lotid=" + lotid;

                links.push({
                    id: lotid,
                    url: rawurl,
                    name: rawname,
                    manufacturer: rawname,
                    make: rawname,
                    description: rawdescription,
                    estimate: rawprice,
                    auction_date: auctionDate,
                    images: rawimages
                });
            }

            return links;
        }, currentUrl);

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

            // this.then(function() {
            //     console.log("test==========1");
            //     this.evaluate(function(lotData) {
            //         return document
            //             .querySelector('[data-lotid="' + lotData.id + '"] a')
            //             .click();
            //     }, lotData);

            //     this.wait(40000);
            // });

            // to ensure the page will completely load

            gatherDetails.call(this, url, lotData);
            scrapeData.currentData++;
            this.then(spiderDetailsPage);
            // var afterWait = function() {
            //     // Collect all the lot data on that page
            //     this.then(function() {
            //         gatherDetails.call(this, url, lotData);
            //         scrapeData.currentData++;
            //         this.then(spiderDetailsPage);
            //     });
            // };

            // this.then(function() {
            //     this.waitForSelector(
            //         '[class="catalog-modal-wrapper"]',
            //         afterWait
            //     );
            // });
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

        var lotStatus = 200;

        qs.log(" - Lot: " + finalUrl);

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
            '[class*="keep-together padding-bottom"] dl dt'
        );

        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].innerText.trim();
            var value = elem[indx].nextElementSibling.innerText.trim();
            details[header] = escapeHTML(value);
        }

        if (details["Colour"]) {
            lot["colour"] = details["Colour"];
        }

        if (details["Engine size"]) {
            lot["engine_size"] = details["Engine size"];
        }

        var registration = "";
        if (details["Registration Number"] || details["Registration Date"]) {
            registration =
                details["Registration Date"] +
                " " +
                details["Registration Number"];
        }
        lot["registration"] = registration.trim();

        if (details["Chassis No."]) {
            lot["chasis_num"] = details["Chassis No."];
        }

        if (details["Lot No."]) {
            lot["lot_num"] = details["Lot No."];
        }

        lot["images"] = [].slice
            .call(
                document.querySelectorAll(
                    '[class="bx-viewport"] ul[class="slides"] li img[src*="' +
                        lotData.id +
                        '"]'
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
            "amazonaws",
            "spincar",
            "FMSearchGet",
            "swipetospin",
            "cloudflare"
        ];
        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
