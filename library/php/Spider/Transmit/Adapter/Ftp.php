<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider\Transmit\Adapter;

use FtpPhp\FtpClient;
use Spider\Transmit\Exception;

class Ftp extends AbstractAdapter
{
    protected $_ftp;

    protected $_config;

    public function __construct($config = array())
    {
        if (!isset($config['config'])) {
            $config['config'] = array(
                'remoteDir' => getenv('FTP_REMOTE_DIR'),
                'host'      => getenv('FTP_HOST'),
                'user'      => getenv('FTP_USER'),
                'password'  => getenv('FTP_PASSWORD'),
                'spiderDataDir' => getenv('SPIDER_DATA')
            );
        }

        $this->_config = $config['config'];

        $this->_initFtpClient();
    }

    public function __destruct()
    {
        $this->_ftp->close();
    }

    protected function _initFtpClient()
    {
        $config = $this->_config;

        $this->_ftp = new FtpClient();

        $this->_ftp->connect($config['host']);

        $this->_ftp->login(
            $config['user'],
            $config['password']
        );

        $this->_ftp->pasv(true);
    }


    public function transmit($filename)
    {
        $localDir  = $this->_config['spiderDataDir'];
        $remoteDir = $this->_config['remoteDir'];

        if (!is_file($filename)) {

            $filename = $localDir . '/' . $filename;

            if (!is_file($filename)) {
                throw new Exception("Cannot find {$filename} to transmit.");
            }
        }

        if (!is_readable($filename)) {
            throw new Exception("File {$filename} is not readable for transmit.");
        }

        return $this->_ftp->put(
            $remoteDir . '/' . pathinfo($filename, PATHINFO_BASENAME),
            $filename,
            FtpClient::BINARY
        );
    }

}
