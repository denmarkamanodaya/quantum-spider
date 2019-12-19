/**
 * Full-Feed Spider 2P
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

// Initialize CasperJS
var casper = qs.getCasper();

// Initialize any spider event listeners
linkSpiderEventListeners();


casper.userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36");

casper
    .start("https://www.auctionhouse.co.uk/auction/search-results?searchType=0")
    .then(function() 
    {
    
        qs.log("--");
        qs.log("Starting spider run...");

        // Step 1: Clear previously logged scrape data
        qs.scrapeDataLog.reset();
        
        // Step 2: Gather all catalogue links
        gatherAllCatalogueLinks.call(this);

        // Step 3: Loop through each catalogue links and gather all the lot links that we need to scrape
        gatherResultLinksFromCatalogues.call(this);

        // Step 4: After gather all the url from catalogue, navigate and scrape lot info
        this.then(function() 
        {
            if (scrapeData.links.length > 0) 
            {
                qs.log("Navigate lots url and scrape data.");

                spiderDetailsPage.call(this);
            }
            else
            {
                qs.log("Navigation completed. No links provided.");
            }
        });

        // Step 4: finalize and send result to importer via API call
        this.then(function() 
        {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function gatherAllCatalogueLinks() 
{
    this.then(function() 
    {
        qs.log("Gather All Catalogue Links if any.");
        
        this.waitForSelector(
        
            '[id="white-bar"]',
        
            function() 
            {
                auction_urls = this.evaluate(function() 
                {
                    var auction_urls    = [];
			
	            auction_urls.push({
                    	url: "https://www.auctionhouse.co.uk/auction/search-results?searchType=0"
                    });

                    return auction_urls;
                });
            }
        );
    });

    this.then(function() 
    {
        qs.log(auction_urls.length + " Total catatalogues found.");
    });
}

function gatherResultLinksFromCatalogues() 
{
    this.then(function() 
    {
        if (auctionIdx < auction_urls.length && auction_urls[auctionIdx]) 
        {
            qs.log("Navigate catalogue: " + auction_urls[auctionIdx].url);

            // Navigate catalogue url then open to load page
            this.thenOpen(auction_urls[auctionIdx].url);

            this.then(function() 
            {
                var afterWait = function() 
                {
                    addLinksToScrapeData.call(this);

                    this.then(function() 
                    {
                        // Increment the current search results page
                        auctionIdx++;
                    
                        if (scrapeData.links.length > 0) 
                        {
                            // Loop through this function until there is none left
                            this.then(gatherResultLinksFromCatalogues);
                        } 
                        else 
                        {
                            qs.log("No Results Found!");
                        }
                    });
                };

                this.then(function() 
                {
                    this.waitForSelector('.container', afterWait);
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
function addLinksToScrapeData() 
{
    this.then(function() 
    {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var newLinks        = this.evaluate(getLinks, auction_urls[auctionIdx]);
        scrapeData.links    = scrapeData.links.concat(newLinks);

        qs.log("Found " + newLinks.length + " links on page. Total to scrape data: " + scrapeData.links.length);
    });
}

// Parse links from element inside the page.
function getLinks(auctionInfo) 
{   
    var links       = [];
    var auctionhouse_obj = document.querySelectorAll("a.home-lot-wrapper-link");

	for (var x = 0; x < auctionhouse_obj.length; x++)
        {
        	if(auctionhouse_obj[x].href.indexOf("www.auctionhouse") > -1)
                {
                	var online_url     = auctionhouse_obj[x].href;

                        links.push({
                        	url: online_url,
                        });
                 }
         }

    return links;
}

/**
 * Spider the details page
 *
 * This function used the array of collected links provided by `scrapeData.links` and
 * provides the logic needed to "loop" over (via recursion) the different lots.
 */
function spiderDetailsPage() 
{
    var url, lotData;

    this.then(function() 
    {
        if (scrapeData.links[scrapeData.currentData]) 
        {
            url         = scrapeData.links[scrapeData.currentData].url;
            lotData     = scrapeData.links[scrapeData.currentData] || {};

            qs.log("DK OPEN URL & WAIT: " + url);

            this.thenOpen(url);

            this.waitForSelector('.container', 

                function()
                {
                    gatherDetails.call(this, url, lotData);
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                },

                function _onTimeout()
                {
                    qs.log("No record of selector on page.", this.getCurrentUrl());
                }
            );
        }
        else 
        {
            qs.log("Total lots found: " + scrapeData.links.length + "; Total lots scraped: " + scrapeData.currentData);
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
function gatherDetails(url, lotData) 
{
    this.then(function() 
    {
        qs.log("DK GATHER DETAILS");

        lotData         = lotData || {};

        var finalUrl    = url;
        var lotDetails  = this.evaluate(parse, lotData);	
        var lotStatus   = this.currentHTTPStatus;

        if(this.currentHTTPStatus === 404) 
        {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 404)", "ERROR");
        }
        else if(this.currentHTTPStatus === 500) 
        {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 505)", "ERROR");
        }
        else if(lotDetails && lotDetails._error) 
        {
            qs.log(" - Lot: " + finalUrl + " - " + JSON.stringify(lotDetails._error), "ERROR");
        }
        else
        {
            qs.log(" - Lot: " + finalUrl);
        }

        /*
            Apply some additional standard formatting to the raw lot data
         */
        lotDetails = {
            source: {
                url:    finalUrl,
                date:   new Date().toUTCString(),
                status: lotStatus
            },
            data: lotDetails
        };

        // Save the lotDetails directly to a file (rather than collect it in memory)
        qs.scrapeDataLog.saveData(lotDetails);
    });
}

function parse(lotData) 
{
    lot = {};

    try 
    {
        // Escape all HTML characters
        function escapeHTML(value) 
        {
            var map = {
                amp: "&",
                lt: "<",
                gt: ">",
                quot: '"',
                "#039": "'",
                nbsp: " "
            };

            return value.replace(/&([^;]+);/g, function(f, c) { return map[c]; });
        }

        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        var details = {};

	// Images
        lot["images"] = [].slice.call(document.querySelectorAll('div#carousel-lot-images img'))
            .map(function(img) 
            {
                return img.src;

            }).filter(function(item, pos, self) 
            {
                return self.indexOf(item) == pos;

            }).join(", ");

        // Price
	var price_obj = document.querySelector("h4.guideprice").innerText.trim();
	    	price_obj = price_obj.replace( /^\D+/g, '');
	    	price_obj = price_obj.replace("+", "");
	    	price_obj = price_obj.replace(",", "");

		if(price_obj.indexOf("-") !== -1)
	    	{
			price_obj = price_obj.split(" - ");
			price_obj = price_obj[1];

			price_obj = price_obj.replace( /^\D+/g, '');
			price_obj = price_obj.replace("+", "");
			price_obj = price_obj.replace(",", "");

			lot["price"] = price_obj.replace(" (plus fees)", "");
	    	}
	    	else
	    	{
			price_obj = price_obj.replace(/^\D+/g, '');
			price_obj = price_obj.replace("+", "");
			price_obj = price_obj.replace(",", "");

			lot["price"] = price_obj.replace(" (plus fees)", "");
	    	}
	
	// Address
	lot["address"] = document.querySelector("div.topbar-lot-info p").innerText.trim();
	
	// Lot Number

	var lot_info_obj = document.querySelectorAll(".lot-info-right ul li");
	
	if(lot_info_obj.count > 2)
	{
		// Type
		lot["type"] = lot_info_obj[1].innerText.trim() + " " + lot_info_obj[0].innerText.trim();
		// Tenure
		lot["tenure"] = lot_info_obj[2].innerText.trim();
	}
		if(lot_info_obj.count == 1)
		{
			// Type
			lot["type"] = lot_info_obj[0].innerText.trim();
		}
		
		if(lot_info_obj.count == 2)
		{
			// Type
			lot["type"] = lot_info_obj[0].innerText.trim();
			// Tenure
			lot["tenure"] = lot_info_obj[1].innerText.trim();
		}


	// Description
        var description_obj = document.querySelectorAll("div.preline p");
	lot["description"] = description_obj[1].innerText.trim();
	
	// Description 2
	lot["description_2"] = document.querySelector("div.preline").innerText.trim();

	// Auction Date
	var auction_date_obj = document.querySelector("div.auction-date");
		auction_date_obj = auction_date_obj.children[1].innerText.trim();
	    	auction_date_obj = auction_date_obj.split(" ");
		auction_date_obj = auction_date_obj[1].split("/");
 	lot["auction_date"] = auction_date_obj[2] + "-" + auction_date_obj[1] + "-" + auction_date_obj[0];
	
	// Auction Time
	var auction_time_obj = document.querySelector("div.auction-time");
		auction_time_obj = auction_time_obj.children[1].innerText.trim();
		auction_time_obj = auction_time_obj.replace(".", ":");
	lot["auction_time"] = auction_time_obj;

	// Auction venue
	var auction_venue_obj = document.querySelectorAll("p.auction-info-header");
	    	auction_venue_obj = auction_venue_obj[2].nextElementSibling.innerText.trim();
	lot["auction_venue"] = auction_venue_obj;
	    




        //lot = jQuery.extend({}, lot, lotData);

    } 
    catch (err) 
    {
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
