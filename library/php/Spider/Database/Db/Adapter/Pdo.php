<?php

namespace Spider\Database\Db\Adapter;

class Pdo
{
    protected $_db;

    public function __construct(\PDO $Connection)
    {
        $this->_db = $Connection;
    }

    public function getConnection()
    {
        return $this->_db;
    }

    public function query($sql, $bind = array())
    {
        $Statement = $this->_db->prepare($sql);

        if (!is_array($bind)) {
            $bind = array($bind);
        }

        $Statement->execute($bind);
        return $Statement;
    }

    public function fetchOne($sql, $bind = array())
    {
        $Statement = $this->query($sql, $bind);
        return $Statement->fetchColumn();
    }

    public function insert($sql)
    {
        $Statement = $this->query($sql);
        return true;
    }

    public function lastInsertId()
    {
        $Statement = $this->query("SELECT LAST_INSERT_ID()", null);
        return $Statement->fetchColumn();
    }

    public function fetchAll($sql, $bind = array())
    {
        $Statement = $this->query($sql, $bind);
        return $Statement->fetchAll();
    }

    public function fetchRow($sql, $bind = array())
    {
        $Statement = $this->query($sql, $bind);
        return $Statement->fetch();
    }

    public function getErrorInfo()
    {
        return $this->_db->errorInfo();
    }

    public function getErrorCode()
    {
        return $this->_db->errorCode();
    }

    public function quoteInto($text, $value, $type = null, $count = null)
    {
        if ($count === null) {
            return str_replace('?', $this->_db->quote($value, $type), $text);
        } else {
            while ($count > 0) {
                if (strpos($text, '?') !== false) {
                    $text = substr_replace($text, $this->_db->quote($value, $type), strpos($text, '?'), 1);
                }
                --$count;
            }
            return $text;
        }
    }
}
