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

class Exception extends CustomException
{}

/**
 * CustomException
 *
 * This is the exception class that will be use. Note that by passing a valid $alertLevel parameter
 * to the constructor, exceptions from this class will automatically log or email themselves.
 *
 */
class CustomException extends \Exception
{
    /**
     * Constructor
     *
     * Constructs an Exception and logs the exception to the syslog.
     *
     * @param string $message Required message
     * @param int $code Optional error code
     * @param \Exception|null $previous Optional previous exception thrown
     */
    public function __construct($message, $code=0, \Exception $previous=null)
    {
        // Try to get the application's name.
        $applicationName = getenv('APP_NAME');

        // Log to the syslog.
        // $Syslogger = Log::registerNewSyslogLogger('exception', $applicationName);
        // $Syslogger->error($message);

        parent::__construct($message, $code, $previous);
    }
}

