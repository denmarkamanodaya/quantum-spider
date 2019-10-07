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
var skip_me = false;

// -----------------------------------------------------------------------------
// Casper initialization
// -----------------------------------------------------------------------------

// Initialize CasperJS
var casper = qs.getCasper();

// Initialize any spider event listeners
linkSpiderEventListeners();


casper
    .start("https://www.exchangeandmart.co.uk/used-cars-for-sale/any-distance-from-bh255sj/private-only")
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
                qs.log("Navigate lots url and scrape data. Total of: " + scrapeData.links.length + " links.");

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
        
            'div[class*="listing"]',
        
            function() 
            {
                auction_urls = this.evaluate(function() 
                {
			var today = new Date();
			var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();

                    var auction_urls            = [];
                    var element                 = document.querySelectorAll('span.hdShow span');                    
                    var pagination_last_count   = Math.ceil(element[0].innerText.trim()/10);
                    // var pagination_last_count   = 1;

                    for (var x = 1; x <= pagination_last_count; x++) 
                    {
                        var auction_url     = "https://www.exchangeandmart.co.uk/used-cars-for-sale/any-distance-from-bh255sj/private-only/page"+x;

                        auction_urls.push({
                            url:            auction_url
                            ,auction_date:  date,
                        });
                    }

                    return auction_urls;
                });
            },

    		function fail() 
    		{
    			qs.log("Wait selector could not be found!");
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

            this.waitForSelector(

                'div[id="results"]', 

                function()
                {
                    addLinksToScrapeData.call(this);

                    this.then(function()
                    {
                        // Increment the current search results page
                        auctionIdx++;

                        if(scrapeData.links.length > 0)
                        {
                            this.then(gatherResultLinksFromCatalogues);
                        }
                        else
                        {
                            qs.log("No results found!");
                        }
                    });
                },

                function fail() 
                {
                    qs.log("Wait selector could not be found!");
                }
            );
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
    var element     = document.querySelectorAll('div.car-name a');

    for (var i = 0; i < element.length; i++) 
    {
        var lotname  = element[i].querySelector('span.ttl_mk').innerText.trim() + element[i].querySelector('span.ttl_md').innerText.trim();
        var lot_url  = element[i].href;

        links.push({
            url:        lot_url,
            name:       lotname
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

            this.waitForSelector('body', 

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

        if(this.exists('p#soz')) { skip_me = true; }


        var finalUrl    = url;
        var lotDetails  = this.evaluate(parse, lotData);	
        var lotStatus   = this.currentHTTPStatus;

        if(this.currentHTTPStatus === 404) 
        {
            //qs.log(" - Lot: " + finalUrl + " - Error (HTTP 404)", "ERROR");
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

        if( ! skip_me)
        {
            // Apply some additional standard formatting to the raw lot data
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
        }
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

        // Exclude URL from the collection
        delete lotData.url;

        var details = {}; 
        var details_obj     = document.querySelectorAll('div.adDetsItem');

        // Assorted
        for(var y=0; y<details_obj.length; y++)
        {
            var text_key    = details_obj[y].children[0].textContent;
            var text_value  = details_obj[y].children[1].innerText.trim();

            // Mileage
            if(text_key == "Mileage")
            {
                lot["mileage"] = text_value;
            }

            // Engine Size
            if(text_key == "Engine Size")
            {
                lot["engine_size"] = text_value;
            }

            // Colour
            if(text_key == "Colour")
            {
                lot["colour"] = text_value;
            }

            // Type / Body Style
            if(text_key == "Body Style")
            {
                lot["type"] = text_value;
            }

            // Fuel
            if(text_key == "Fuel Type")
            {
                lot["fuel"] = text_value;
            }

            // Transmission / Gearbox
            if(text_key == "Transmission")
            {
                lot["gearbox"] = text_value;
            }
        }

        // Description
        lot['description']  = document.querySelector("p#descriptionTxt").innerText.trim();

        // Model
        lot['model']        = document.querySelector("span.ttl").innerText.trim();

        // Name
        lot['name']         = lot['mode'] + " " + document.querySelector("span.ttlSup").innerText;

        // Images
        lot["images"]       = [].slice.call(document.querySelectorAll('img[class*="thumbImg"]'))
            .map(function(img) 
            {
                return img.src;

            }).filter(function(item, pos, self) 
            {
                return self.indexOf(item) == pos;

            }).join(", ");


        lot["auction_date"] = '2019-11-12';

        // // MOT
        // if (details["MOT"]) 
        // {
        //     lot["mot"] = details["MOT"];
        // }

        // // Registration No
        // if (details["Registration No"]) 
        // {
        //     lot["registration"] = details["Registration No"];
        // }

        // // Estimate
        lot["estimate"] = document.querySelector('span[class*="price"]').innerText.trim();
        lot["price"]    = document.querySelector('span[class*="price"]').innerText.trim().replace(/\D/g,'');

        // //description
        // var description = "";
        // // description += document.querySelector('[class="page-header-desc"]').innerHTML + "<br/><br/>";
        // // description += document.querySelector('[class="mb50"]').previousElementSibling.innerHTML;
        // lot["description"] = description;

        // // Auction Date
        // lot["auction_date"] = lotData.auction_date;

        // // Manufacturer
        // if (details["Manufacturer"]) 
        // {
        //     lot["manufacturer"] = details["Manufacturer"];
        // }

        lot = jQuery.extend({}, lot, lotData);

    } 
    catch (err) 
    {
        lot["_error"] = err.message;
    }

    return lot;
}

function linkSpiderEventListeners() 
{
    casper.on("resource.requested", function(requestData, request) 
    {
        var skip = [
            "facebook",
            "twitter",
            "cdn.syndication",
            "linkedin",
            "google-analytics",
            "youtube",
            "player-en_US",
            "addthis_widget",
            "foundation"
        ];

        skip.forEach(function(needle) 
        {
            if (requestData.url.indexOf(needle) > 0) 
            {
                request.abort();
            }
        });
    });

    casper.on("resource.requested", function(requestData, request) 
    {
        if (!(requestData.url.indexOf("exchangeandmart") > -1)) 
        {
            request.abort();
        }
    });
}
