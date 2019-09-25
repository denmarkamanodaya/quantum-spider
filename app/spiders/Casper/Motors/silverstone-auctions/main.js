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
var sessionIdx = 0;

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
    .start("http://www.silverstoneauctions.com/auctions")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the catalogue links that we need to scrape
        */
        gatherAllCatalogueLinks.call(this);


		sessionCompilation.call(this);

        /*
            Step 2: Loop through each catalogue links and gather all the search results links that we need to scrape
        */
        //gatherSearchResultLinksFromCatalogues.call(this);

        /*
            Step 3: After gather all the url from catalogue, navigate and scrape lot info
		*/
        this.then(function() {
            qs.log("Navigate lots url and scrape data." + scrapeData.links.length);
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
            '[class="event-list__items event-list__upcoming"]',
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls = [];
                    var element = document.querySelectorAll('div.event-list__upcoming > div');
			
                    for (var i = 0; i < element.length; i++) {

				        var viewing = element[i].children[0].children[3].children[0].href;

                        /*
                        var viewing = element[
                            i
                        ].children[0].children[0].children[1].children[0].innerText.trim();
                        var auction_date = element[
                            i
                        ].children[0].children[0].children[1].children[2].innerText.trim();
                        var sate_type = element[
                            i
                        ].children[0].children[0].children[1].children[3].innerText.trim();
                        var path =
                            element[i].children[0].children[0].children[2].href;
			
                        auction_urls.push({
                            viewing: viewing.split(":")[1].trim(),
                            auction_date: auction_date.split(":")[1].trim(),
                            sate_type: sate_type.split(":")[1].trim(),
                            url: path + "/view_lots/pn/all"
                        });
			            */
			
            			auction_urls.push({
            				url: viewing
            			});
                    }

                    return auction_urls;
                });

                this.then(function() { qs.log(auction_urls.length + " catalogues/auctions found"); });
            },
            function _onTimeout() {
                qs.log("No record on the page " + this.getCurrentUrl());
            }
        );
    });
}

function sessionCompilation()
{    
	this.then(function() 
	{
		if(sessionIdx < auction_urls.length && auction_urls[sessionIdx]) 
		{
			qs.log("Navigate event list: " + auction_urls[sessionIdx].url);

			this.thenOpen(auction_urls[sessionIdx].url);

			this.then(function()
			{
                var afterWait = function()
                {
                    // addLinksToScrapeType
                    this.then(function()
                    {
                        qs.log("Checking session results: " + this.getCurrentUrl());

                        var newLinks = this.evaluate(function()
                        {
                            // // getLinks
                            var session_urls = [];
                            var session_element = document.querySelectorAll('[class="sale-list__session-list--item"]');

                            for(var i=0; i < session_element.length; i++)
                            {
                                // var session_list_auction_date = session_element[i].children[0].innerText;
                                // var test = session_list_auction_date.split(" ");
                                // session_list_auction_date = test[2].replace(/\D/g, '') + " " + test[3] + " " +  test[4];
				
								var session_list_title = session_element[i].children[0].innerText;

								if( ! isNaN(session_list_title.charAt(0)))
								{	
									if(session_list_title.indexOf("Cars") != -1)
									{
				       	                        		session_urls.push({
						                                    url: session_element[i].children[1].href
					                                	});
									}
								}
                            }
                            return session_urls;
                            // getLinks
                        });

                        scrapeData.links = scrapeData.links.concat(newLinks);
                        
                        qs.log("Adding " + newLinks.length + " new links of " + scrapeData.links.length);
                    });
                    // addLinksToScrapeType

                    this.then(function() 
                    {
                        sessionIdx++
                        this.then(sessionCompilation);
                    });
                };


                this.then(function() { this.waitForSelector('.sale-list__session-list', afterWait); });

			});
		}
	});
}



// function gatherSearchResultLinksFromCatalogues() {

//     this.then(function() {
//         if (auctionIdx < session_urls.length && session_urls[auctionIdx]) {
//             qs.log("Navigate catalogue: " + session_urls[auctionIdx].url);

//             // Navigate catalogue url
//             this.thenOpen(session_urls[auctionIdx].url);

//             this.then(function() {
//                 // To ensure the page will completely load
//                 var afterWait = function() {
//                     // Collect all the links to scrape data on the page
//                     addLinksToScrapeData.call(this);

//                     this.then(function() {
//                         // Increment the current search results page
//                         auctionIdx++;

//                         // Run this function again until there are no more catalogues
//                         this.then(gatherSearchResultLinksFromCatalogues);
//                     });
//                 };

//                 this.then(function() {
//                     this.waitForSelector(
//                         "div.lot",
//                         afterWait,
//                         function _onTimeout() {
//                             qs.log(
//                                 "No lots on the auction page " +
//                                     this.getCurrentUrl()
//                             );
//                         }
//                     );
//                 });
//             });
//         }
//     });
    
// }

// /**
//  * Add links
//  *
//  * This function evaluates the current page and looks for links to the data that
//  * need to be scraped.  Scrape data links are added to `scrapeData.links`.  Later on, we will
//  * loop through that array to gather the scrape data details from each page.
//  */
// function addLinksToScrapeData() {
//     this.then(function() {
//         qs.log("Scraping search results page: " + this.getCurrentUrl());

//         var newLinks = this.evaluate(getLinks, session_urls[auctionIdx]);
//         scrapeData.links = scrapeData.links.concat(newLinks);

//         qs.log(
//             "Found " +
//                 newLinks.length +
//                 " links on page. Total to scrape data: " +
//                 scrapeData.links.length
//         );
//     });
// }

// function getLinks(auctionInfo) {
//     var links = [];

//     var elem = document.querySelectorAll("a.view-auction");
//     for (var i = 0; i < elem.length; i++) {
//         var lotlink = elem[i].href;

//         links.push({
//             url: lotlink,
//             auction_date: auctionInfo.auction_date
//         });
//     }

//     return links;
// }

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
                //this.waitForSelector("#view-auction", afterWait);
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
        var lotname = document
            .querySelector("#view-auction > h2")
            .innerText.trim();

        lot["name"] = lotname;
        lot["manufacturer"] = lotname;
        lot["model"] = lotname;

        var details = {};
        var elem = document.querySelectorAll("div.details div");

        for (var indx = 0; indx < elem.length; indx++) {
            var fields = elem[indx].innerText.split(":");

            if (fields.length === 2) {
                var header = fields[0].trim();
                var value = fields[1].trim();
                details[header] = value;
            }
        }

        var description = "";
        if (document.querySelector(".description"))
            description = document.querySelector(".description").innerHTML;
        else description = document.querySelector("div.details").innerHTML;

        if (document.querySelector("#view-auction h2.float-right")) {
            description =
                document
                    .querySelector("#view-auction h2.float-right")
                    .innerText.trim() +
                "<br/><br/>" +
                description;
        }

        lot["description"] = description;

        if (details["Estimate (£)"]) {
            lot["estimate"] = details["Estimate (£)"];
        }

        if (details["Registration"]) {
            lot["registration"] = details["Registration"];
        }

        if (details["CC"]) {
            lot["engine_size"] = details["CC"];
        }

        try {
            lot["lot_num"] = document
                .querySelector("#view-auction h2.float-right")
                .innerText.split("Lot No.:")[1]
                .trim();
        } catch (err) {}

        lot["images"] = [].slice
            .call(document.querySelectorAll("#carcarousel img"))
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
        if (!(requestData.url.indexOf("silverstoneauctions") > -1)) {
            request.abort();
        }
    });
}
