<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider\Engine;

use Spider\Exception;

class Casper extends AbstractEngine
{
    protected $_config;

    protected $_name;

    protected $_vertical;

    protected $_url;

    protected $_spider;

    /**
     * Constructor
     *
     * @param array $spiderInfo
     * @param array $config Optional config array
     *
     * @throws \Spider\Exception
     */
    public function __construct(\Spider\Spider $spider, $config = array())
    {
        /*
         * Set DI first since we config to validate spider
         */
        if (!isset($config['config'])) {
            $config['config'] = (object) array(
                'spiderDir' => getenv('CASPERJS_SPIDER_DIR')
            );
        }

        $this->_config = $config['config'];

        $this->_spider = $spider;

        $this->_initSpider();
    }

    protected function _initSpider()
    {
        $spiderInfo = $this->_spider->getSpiderInfo();

        /*
         * Validate spider info
         */
        $isValid = $this->_validateSpider($spiderInfo);
        if ($isValid !== true) { // Strict boolean TRUE check
            throw new Exception("Invalid spider: {$isValid}");
        }

        /*
         * Initialize the spider
         */
        $this->_name    = $spiderInfo['name'];
        $this->_vertical = $spiderInfo['vertical'];
        $this->_url     = $spiderInfo['url'];
    }

    /**
     * Validate spider details
     *
     * Given a spider name and vertical name, this checks to make sure a
     * matching spider is actually defined on this server.
     *
     * Returns TRUE if valid.  Otherwise a validation error message will be
     * returned.
     *
     * @param array $info
     *
     * @return bool|string
     */
    protected function _validateSpider($info)
    {
        // Needs to be an array
        if (!is_array($info)) {
            return "Not an array.";
        }

        // Verify all required keys exist (we don't care about "engine" now)
        $reqKeys = array("vertical", "name", "url");

        if (!$this->arrayContainsAllRequiredKeys($reqKeys, $info)) {
            return "Missing required index(es).";
        }

        // Validate the URL--only if provided
        if ($info['url'] && !filter_var($info['url'], FILTER_VALIDATE_URL)) {
            return "Invalid URL provided.";
        }

        $spiderFile = $this->_config->spiderDir
            . '/' . $info['vertical']
            . '/' . $info['name']
            . '/main.js';

        $validFile = is_file($spiderFile);

        if (!$validFile) {
            return "Spider definition not found. ({$spiderFile})";
        }

        return true;
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
     * Default Spider File Config
     * @return string
    */
    protected $_defaultConfig = array(
        "casperFlags" => "--ignore-ssl-errors=yes --ssl-protocol=any"
    );

    /**
     * Dynamic Spider File Config
     *
     * @return array
    */
    protected function _getSpiderConfig()
    {
        $configFile = $this->_config->spiderDir
            . '/' . $this->_vertical
            . '/' . $this->_name
            . '/config.json';

        $config = array();

        if (is_file($configFile)) {
            $config = json_decode(file_get_contents($configFile), true);
        }

        return array_merge($this->_defaultConfig, $config);
    }

    /**
     * Run this spider
     *
     * Runs a CasperJS spider and returns TRUE if the script started
     * successfully.  This method DOES NOT wait for the spider to finish
     * running.  The spider is executed as a separate Linux process.
     *
     * You are not allowed to run the same spider concurrently.  If you try to
     * run a spider that is already running, an exception will be thrown. You
     * CAN run any number of DIFFERENT spiders concurrently since each will get
     * its own unique process.
     *
     * THIS WILL ONLY WORK ON A LINUX MACHINE
     *
     * @throws \Spider\Exception
     * @return bool
     */
    public function run()
    {
        $process = $this->_spider->getProcess();

        // No concurrency
        if ($process->isRunning()) {
            throw new Exception("Spider is already running. Aborted");
        }

        // Reset any existing PID file
        $process->reset();

        /*
        * Use formal getters here since they provide some validation
        */
        $pathToSpider = $this->_getSpiderPath();
        $logFile      = $this->_getLogFileName();
        $config       = $this->_getSpiderConfig();

        // Shell command to run
        $cmd = 'casperjs '
            . $config['casperFlags']
            . ' '
            . $pathToSpider
            . ' '
            . $this->_vertical
            . ' '
            . $this->_name
            . ' '
            . $process->getUniqueFileId()
            . ' '
            . $this->_url;

        /*
         * Here is some trickery.  What we are doing is running the spider
         * without waiting for it to finish.  In addition we get the generated
         * process ID (pid) and return that.
         *
         * NOTE: This will absolutely fail in Windows!
         */

        $exe = sprintf(
            "%s > %s 2>&1 & echo $!",
            $cmd,
            $logFile
        );

        $pid = trim(shell_exec($exe));

        return $this->_setPid($pid);
    }

    /**
     * Set the process ID
     *
     * Process IDs are tracked via files.
     *
     * @param int $pid
     * @return bool
     */
    protected function _setPid($pid)
    {
        return $this->_spider->getProcess()->setRunningPid($pid);
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
     */
    public function getCurrentPid()
    {
        return $this->_spider->getProcess()->getCurrentPid();
    }

    public function getExecutionInfo()
    {
        return $this->_spider->getProcess()->getExecutionInfo();
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
        return $this->_spider->getProcess()->isRunning();
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
        return $this->_spider->getProcess()->getCurrentRuntime();
    }

    /**
     * Get unique file id
     *
     * Returns a string that can be used to name files that are unique to this
     * spider configuration.
     *
     * @return string
     */
    protected function _getUniqueFileId()
    {
        return $this->_name;
    }

    /**
     * Get the spider file path
     *
     * Returns the location of the CasperJS spider runtime file.
     *
     * @return string
     * @throws \Spider\Exception
     */
    protected function _getSpiderPath()
    {
        $spiderDir  = $this->_config->spiderDir;

        $pathToSpider = $spiderDir . '/' . $this->_vertical
                                   . '/' . $this->_name
                                   . '/' . 'main.js';

        if (!is_file($pathToSpider)) {
            throw new Exception("CasperJS spider file not found. ({$pathToSpider})");
        }

        return $pathToSpider;
    }

    /**
     * Get the core spider log file
     *
     * By default, CasperJS will output a lot of helpful information to STDOUT,
     * but when we run the spider via a PHP routine, we need to redirect that
     * output to a file that can be reviewed later.  This defines the name and
     * location of that file.
     *
     * @return string
     * @throws \Spider\Exception
     */
    protected function _getLogFileName()
    {
        $logDir = getenv('SPIDER_LOGS');

        if (!is_dir($logDir) || !is_writable($logDir)) {
            throw new Exception("Log directory '{$logDir}' is not writable.");
        }

        $logDir .= '/' . $this->_getUniqueFileId() . '.txt';

        return $logDir;
    }
}
