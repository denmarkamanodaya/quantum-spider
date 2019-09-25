<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider\Process\Engine;

use Spider\Process\Exception;

abstract class AbstractEngine
{
    /**
     * @var string Process ID
     */
    protected $_pid;

    /**
     * @var string Spider name
     */
    protected $_name;

    /**
     * @var string Spider vertical name
     */
    protected $_vertical;

    /**
     * @var string Spider URL
     */
    protected $_url;

    /**
     * @var array
     */
    protected $_data = array();

    /**
     * @var string|bool Directory PID files are stored in
     */
    protected $_pidDir;

    /**
     * @var \Spider\Spider
     */
    protected $_spider;

    /**
     * Generate real-time spider execution information
     * @return array
     */
    abstract protected function _generateSpiderExecutionInfo();

    /**
     * Get path config for this engine
     *
     * If no $name argument provided, default path will be returned.
     *
     * @param string $name Optional path config value to return
     *
     * @return string
     */
    abstract protected function _getPathConfig($name = "");

    /**
     * Constructor
     *
     * @param \Spider\Spider $spider
     */
    public function __construct(\Spider\Spider $spider)
    {
        $this->_spider = $spider;

        $this->_initSpider();
    }

    /**
     * Initialize spider engine
     */
    protected function _initSpider()
    {
        $spiderInfo = $this->_spider->getSpiderInfo();
        $this->_name    = $spiderInfo['name'];
        $this->_vertical = $spiderInfo['vertical'];
        $this->_url     = $spiderInfo['url'];
    }

    /**
     * Set the process ID
     *
     * Process IDs are tracked via files.
     *
     * @param int $pid
     *
     * @throws \Spider\Process\Exception
     * @return bool
     */
    public function setRunningPid($pid)
    {
        if (is_numeric($pid)) {
            $this->_pid = (int) $pid;

            $data = $this->_generateSpiderExecutionInfo();

            // TODO: Add better validation here
            if (!isset($data['type'])) {
                throw new Exception("Invalid execution info returned.");
            }

            $bytesWritten = file_put_contents($this->_getPidFileName(), json_encode($data));
            return is_int($bytesWritten);
        }

        return false;
    }

    /**
     * Get this spider's current process ID
     *
     * This looks for a matching process ID file and gets PID number out of it.
     * This number is returned.  If no file is found or there isn't a number in
     * the file, FALSE is returned.  FALSE, in this instance means that the
     * spider is not known to be running. Getting a number does NOT necessarily
     * mean the spider is running since it could be an expired PID number.
     *
     * @return bool|string
     * @throws \Spider\Process\Exception
     */
    public function getCurrentPid()
    {
        $info = $this->getExecutionInfo();

        if ($info === array()) {
            return false;
        }

        if (isset($info['pid']) && is_numeric($info['pid'])) {
            return $info['pid'];
        }

        return false;
    }

    /**
     * Get execution information
     *
     * This method looks up the PID file for this spider and extracts the
     * information stored in the file.
     *
     * @return array
     * @throws \Spider\Runtime\Process\Exception
     */
    public function getExecutionInfo()
    {
        $pidFile = $this->_getPidFileName();

        // It's possible the file doesn't exist because it was never created
        if (!is_file($pidFile)) {
            return array();
        }

        if (!is_readable($pidFile)) {
            throw new Exception("Cannot read PID file: {$pidFile}.");
        }

        // Extract and decode
        $data = json_decode(file_get_contents($pidFile), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            return array();
        }

        return $data;
    }

    /**
     * Is Running?
     *
     * This method does two things:
     *   1.) It first checks to see if there is a PID file out there with a
     *       numeric PID value in it.
     *   2.) If a PID is found we further query the OS to see if that PID is
     *       running.
     *
     * @return bool
     */
    public function isRunning()
    {
        $pid = $this->getCurrentPid();


        // $pid may be FALSE if no file is found
        if (!is_numeric($pid)) {
            return false;
        }

        try {
            $result = shell_exec(sprintf("ps %d", $pid));

            /*
             * Example result might be:
             *   PID TTY      STAT   TIME COMMAND
             *   1   ?        Ss     0:01 /sbin/init
             *
             * So broadly speaking, 2 lines means we found the process running
             */
            if (count(explode("\n", $result)) > 2) {
                return true;
            }
        }
        catch (\Exception $e) {
            // TODO: Add Insight logging here
            // No catch logic here..
        }

        return false;
    }

    /**
     * Get current runtime in seconds
     *
     * Checks the PID file and calculates the number of seconds since it was
     * last modified.  This method can be used to determine if a spider might
     * still be running but is also hung for whatever reason.
     *
     * @return int
     */
    public function getCurrentRuntime()
    {
        if (!$this->isRunning()) {
            return 0;
        }

        $modifiedTime = filectime($this->_getPidFileName());

        if ($modifiedTime === false) {
            // TODO: Log error to Insight
            return 0;
        }

        return time() - $modifiedTime;
    }

    /**
     * Reset the process ID file
     *
     * Deletes the PID file.
     *
     * @return bool
     */
    public function reset()
    {
        $pidFile = $this->_getPidFileName();

        if (is_file($pidFile)) {
            return unlink($pidFile);
        }

        return true;
    }

    /**
     * Get the process ID file name
     *
     * @return string
     * @throws \Spider\Process\Exception
     */
    protected function _getPidFileName()
    {
        $pidPath = getenv('SPIDER_PIDS');

        if (!is_dir($pidPath) || !is_writable($pidPath)) {
            throw new Exception("PID directory '{$pidPath}' is not writable.");
        }

        /*
         * PID is constructed as:
         *  <spiderName>.pid
         */

        $pidPath .= '/' . $this->getUniqueFileId() . '.pid';

        return $pidPath;
    }

    /**
     * Get unique file id
     *
     * Returns a string that can be used to name files that are unique to this
     * spider configuration.
     *
     * @return string
     */
    public function getUniqueFileId()
    {
        return $this->_name;
    }

    /**
     * Get the time the last scrape data was found.
     *
     * A critical assumption of this code is that spiders will work by appending
     * data to a file with each scrape data found.  Using this assumption, we can
     * determine the time the last scrape data was found by checking the file's
     * modified date.  If, in the future, we have spiders that process scrape data
     * in a different manner that might defeat the primary assumption here, we will
     * want to move this method into the implementing child class that is
     * spider engine specific.
     *
     * To get a date() formatted version of the timestamp, pass the format
     * string as the first argument.  Otherwise a unix timestamp is returned
     * or, if the scrape data file isn't found, FALSE will be returned.
     *
     * @param string|bool $format Date format. If omitted, timestamp is returned
     * @return bool|int|string
     */
    public function getLastSpiderDataFoundTime($format = false)
    {
        $fileName = $this->getUniqueFileId() . '.txt';
        $spiderDataDir  = $this->_getPathConfig('SPIDER_DATA');

        $file = $spiderDataDir . '/' . $fileName;

        if (!is_file($file)) {
            return false;
        }

        $time = filemtime($file);

        if ($format !== false) {
            return date($format, $time);
        }

        return $time;
    }

    /**
     * Get process status
     *
     * Extracts information from the PID file and also queries the server
     * environment to gather important status about this process.
     *
     * @return array
     */
    public function getStatus()
    {
        $info = $this->getExecutionInfo();

        $dateFormat = 'Y-m-d H:i:s';

        return array(
            "vertical"      => $this->_vertical,
            "name"         => $this->_name,
            "engine"       => (isset($info['type'])) ? $info['type'] : "(unknown)",
            "isRunning"    => $this->isRunning(),
            "started"      => (is_int($info['start'])) ? date($dateFormat, $info['start']) : null,
            "timezone"     => date("e"),
            "runtime"      => $this->getCurrentRuntime(),
            "lastSpiderDataFound" => $this->getLastSpiderDataFoundTime($dateFormat),
            "processId"    => ($this->isRunning()) ? $this->getCurrentPid() : false,
            "serverName"   => gethostname(),
            "hash"         => $this->getUniqueFileId(),
            "isHung"       => $this->isHung()
        );
    }

    /**
     * Is hung?
     *
     * Returns true if this process has been running for a more than 3 minutes
     * without logging a new scrape data.
     *
     * @return bool
     */
    public function isHung()
    {
        // Hung if more than 3 minutes (180 seconds) since last scrape data found
        return $this->isRunning()
            && (time() - $this->getLastSpiderDataFoundTime()) > 180;
    }

    /**
     * Kill process
     *
     * Note: This method doesn't really kill any hung processes yet. But it will
     * unlock the PID file so you can run a new spider.
     *
     * @todo Add logging
     * @return bool
     */
    public function killProcess()
    {
        if (!$this->isRunning()) {
            return false;
        }

        return $this->reset();
    }
}
