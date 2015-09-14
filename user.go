package main

import (
	//	"code.google.com/p/go.crypto/bcrypt"
	"encoding/json"
	"log"
	"net/http"
)

type User struct {
	ID       int `json:"_id,omitempty"`
	Username string
	Password []byte
	Posts    int
}

type UserInvEmail struct {
	UserID int        `json:"user_id"`
	Email  NullString `json:"email"`
}

func setupUsersHandlers() {
	http.HandleFunc("/users/inv_email", usersInvEmailAPIHandler)
}

func usersInvEmailAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":

		// instead of test_user_id, user is posting id from http request
		// XXX In future also replace this with proper authentication
		user_id := r.URL.Query().Get("user_id")

		// first make sure user is vaild and authenticated
		var user_valid bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id=$1);", user_id).Scan(&user_valid)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !user_valid {
			http.Error(w, "User ID is not valid!", http.StatusInternalServerError)
			return
		}

		var ret_user_email UserInvEmail
		err = db.QueryRow("SELECT inv_email_recipient FROM users WHERE id=$1;", user_id).Scan(&ret_user_email.Email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&ret_user_email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":

		// also need to fix test_user_id case here
		var user_email UserInvEmail
		log.Println("Received post")

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&user_email)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(user_email)

		var user_valid bool
		err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id=$1);", user_email.UserID).Scan(&user_valid)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !user_valid {
			http.Error(w, "User ID is not valid!", http.StatusInternalServerError)
			return
		}

		_, err = db.Exec("UPDATE users SET inv_email_recipient=$1 WHERE id=$2", user_email.Email, user_email.UserID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}
