<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider;

use Spider\Runtime\Exception;
use Spider\Runtime\Process\Engine\AbstractEngine;

/**
 * Spider Runtime Utility
 *
 * The scope of this class is to provide a high-level interface for interacting
 * with the spidering runtime. Key features are the ability to call out to a
 * scheduling engine that will dictate which spider to ran next.  There is also
 * logic here for querying the status of the server and all the spiders on it.
 *
 * @package Spider
 */
class Runtime
{
    /**
     * @var Runtime Singleton instance
     */
    static protected $_instance;

    /**
     * Protected constructor
     * @param array $config
     */
    protected function __construct($config = array())
    {}

    /**
     * Singleton constructor
     * @return Runtime
     */
    static public function getInstance()
    {
        if (!self::$_instance instanceof self) {
            self::$_instance = new self();
        }

        return self::$_instance;
    }

    /**
     * Get next spider
     *
     * Envokes the spider scheduling engine and loads the next spider.
     *
     * @return Spider
     * @throws Runtime\Exception
     */
    public function getNextSpider()
    {
        $spiderInfo = $this->_getNextScheduledSpider();
        return $this->getSpider($spiderInfo);
    }

    /**
     * Get spider (factory)
     *
     * @param array $spiderInfo
     *
     * @throws Runtime\Exception
     * @return Spider
     */
    public function getSpider($spiderInfo)
    {
        if (isset($spiderInfo['spider'])) {
            $spiderInfo['name'] = $spiderInfo['spider'];
        }

        if (!$this->validateSpiderInfo($spiderInfo)) {
            throw new Exception("Cannot get spider.  Invalid parameters.");
        }

        $Spider = new \Spider\Spider(
            $spiderInfo['type'],
            $spiderInfo['name'],
            $spiderInfo['vertical'],
            (isset($spiderInfo['url'])) ? $spiderInfo['url'] : ""
        );

        return $Spider;
    }

    /**
     * Validate spider info
     *
     * Validates an array to be sure it can be used to instantiate a new Spider.
     *
     * @param array $spiderInfo
     *
     * @return bool
     */
    public function validateSpiderInfo($spiderInfo)
    {
        $reqParams = array(
            'type', 'vertical', 'name',
        );

        // Skip any invalid PID entries
        return $this->arrayContainsAllRequiredKeys($reqParams, $spiderInfo);
    }

    /**
     * Array contains all required keys?
     *
     * Simple validation check to see if a given array contains every required key.
     * Note that we don't do anything more here than just check that the array key exists.
     *
     * @param array $reqKeys
     * @param array $testArray
     *
     * @return bool
     */
    protected function arrayContainsAllRequiredKeys($reqKeys, $testArray)
    {
        if (!is_array($reqKeys) || !is_array($testArray)) {
            return false;
        }

        return (0 === count(array_diff($reqKeys, array_keys($testArray))));
    }

    /**
     * Get next scheduled spider
     *
     * This method queries the Spider Scheduling Engine and returns key
     * information needed to initialize a spider run.  Right now we assume
     * direct access to SQL Server, but in the future, we may need to change
     * this logic to make a REST API call.
     *
     * @return array
     */
    protected function _getNextScheduledSpider()
    {
        /*
         * Call the spider scheduling sproc to get the next spider to run.
         * Note that we also pass to the scheduler this servers host name so
         * that the routine could isolate specific hosts to run spiders on.
         *
         * For now, we expect this array to be returned:
         * ```
         * array(
         *  "name"    => "...",  // Name of spider
         *  "engine"  => "...",  // Engine type (typically Casper)
         *  "vertical" => "...", // Name of vertical (e.g. Motors)
         *  "url"     => "...",  // URL to scrape
         * )
         * ```
         */

        /*
        return $this->_db->fetchRow(
            "EXEC get_next_spider(?)",
            array(
                gethostname()  // Get this servers standard host name
            )
        );
        */

        return array(
            'name'    => 'external-site',
            'type'    => 'Casper',
            'vertical' => 'Motors',
            'url'     => ''
        );
    }

    /**
     * Get all logged processes
     *
     * These processes may or may not be running.
     *
     * @return array An array of AbstractEngine objects
     */
    protected function _getAllLoggedProcesses()
    {
        $execInfo = $this->_getAllPidExecutionInfo();

        $processes = array();

        foreach ($execInfo as $info) {

            try {
                $processes[] = $this->getSpider($info)->getProcess();
            }
            catch (\Exception $e) {
                // throw $e;
                // TODO: Add logging here
            }

        }

        return $processes;
    }

    /**
     * Get the status of all logged processes
     *
     * @return array
     */
    public function getAllProcessesStatus()
    {
        $allProcesses = $this->_getAllLoggedProcesses();

        $status = array();

        foreach ($allProcesses as $process) {
            /* @var $process \Spider\Runtime\Process\Engine\AbstractEngine */
            $status[] = $process->getStatus();
        }

        return $status;
    }

    /**
     * Get all stored PID execution data
     *
     * @return array
     */
    protected function _getAllPidExecutionInfo()
    {
        // Get all the files to extract info from
        $files = $this->_getAllPidFileNames();

        $data = array();

        /*
         * Loop over each found PID file and extract the contents.  If the
         * file contains valid JSON it is decoded as an associative array and
         * then pushed onto $data.
         */
        foreach ($files as $file) {
            $info = file_get_contents($file);

            // If not an empty file...
            if (trim($info)) {
                $info = json_decode($info, true);

                if (json_last_error() === JSON_ERROR_NONE) {

                    // Log the PID file to make debugging easier
                    $info['_pidFile'] = $file;

                    $data[] = $info;
                }
            }
        }

        return $data;
    }

    /**
     * Get all PID file names
     *
     * @return array
     * @throws Runtime\Exception
     */
    protected function _getAllPidFileNames()
    {
        $pidDir = getenv('SPIDER_PIDS');

        if (!is_dir($pidDir)) {
            throw new Exception("PID directory '{$pidDir}' is invalid.");
        }

        // Scan all the files in the PID directory
        $files = scandir($pidDir);


        // Remove . and .. from scanned results
        $files = array_diff($files, array('..', '.'));

        /*
         * We need the absolute file name to make things easier later on so here
         * we prepend the PID directory name we just scanned to each file name.
         */
        foreach ($files as &$file) {  // (note "&" for value reference)
            $file = $pidDir . '/' . $file;
        }

        return $files;
    }
}
