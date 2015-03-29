package main

//import (
//	"code.google.com/p/go.crypto/bcrypt"
//)

type User struct {
	ID       int `json:"_id,omitempty"`
	Username string
	Password []byte
	Posts    int
}
