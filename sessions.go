package main

import (
	"errors"
	"github.com/gorilla/sessions"
	"golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"strconv"
	"time"
)

var session_store = sessions.NewCookieStore([]byte("bevapp-sessions-secret"))

const g_basic_privilege = "basic"
const g_admin_privilege = "admin"

func initSessionStore(isProduction string) {
	// init sessions for user authentication sessions
	var server_domain = "localhost"
	if isProduction == "1" {
		server_domain = "192.241.217.104"
	}
	session_store.Options = &sessions.Options{
		Domain:   server_domain,
		Path:     "/",
		MaxAge:   3600 * 8, // 8 hours
		HttpOnly: true,
	}
}

func setupSessionHandlers() {

	http.HandleFunc("/login", LoginHandler)
	http.HandleFunc("/logout", LogoutHandler)
	http.HandleFunc("/signup", SignUpHandler)

}

func sessionGetUserID(w http.ResponseWriter, r *http.Request) (user_id string, err error) {

	loginSession, err := session_store.Get(r, "loginSession")
	if err != nil {
		log.Println(err.Error())
		http.Redirect(w, r, "/login", http.StatusFound)
		return ERR_RET_STR, err
	}
	if val, ok := loginSession.Values["id"].(string); ok {
		// if val is a string
		switch val {
		case "":
			http.Redirect(w, r, "/login", http.StatusFound)
			return ERR_RET_STR, errors.New("Empty user ID for login session.")
		default:
			return val, nil
		}
	} else {
		http.Redirect(w, r, "/login", http.StatusFound)
		return ERR_RET_STR, errors.New("Missing user ID for login session.")
	}
	http.Redirect(w, r, "/login", http.StatusFound)
	return ERR_RET_STR, errors.New("Missing user ID for login session.")
}

func sessionGetUserCurrentRestaurant(user_id string) (restaurant_id string, err error) {

	err = db.QueryRow(`
		SELECT cur_restaurant FROM users WHERE id=$1 AND active=TRUE;`,
		user_id).Scan(&restaurant_id)
	if err != nil {
		log.Println(err.Error())
		return ERR_RET_STR, err
	}
	return restaurant_id, nil
}

func sessionGetUserAndRestaurant(w http.ResponseWriter, r *http.Request) (user_id string, restaurant_id string, err error) {

	user_id, err = sessionGetUserID(w, r)
	if err != nil {
		return ERR_RET_STR, ERR_RET_STR, err
	}
	restaurant_id, err = sessionGetUserCurrentRestaurant(user_id)
	if err != nil {
		return ERR_RET_STR, ERR_RET_STR, err
	}
	return user_id, restaurant_id, nil
}

// Call this function before every API call that needs authentication
// Sessions are provided by gorilla/sessions
//     Should have "id" and "email" Values stored from login cookie
// @req_privilege denotes minimum privilege level user must have to access
//     g_admin_privilege "admin"
//     g_basic_privilege "basic"
func sessionDecorator(f http.HandlerFunc, req_privilege string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		log.Println("In session decorator")

		loginSession, err := session_store.Get(r, "loginSession")
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// check for id key to verify is valid user
		// Set session values for identification
		if user_id, ok := loginSession.Values["id"].(string); ok {

			log.Println("USER ID OKAY")

			// if user_id is a string
			switch user_id {
			case "":
				http.Redirect(w, r, "/login", http.StatusFound)
			default:
				log.Println(user_id)
				var restaurant_id int
				err := db.QueryRow(`
					SELECT cur_restaurant FROM users WHERE id=$1 AND active=TRUE;`,
					user_id).Scan(&restaurant_id)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusBadRequest)
					http.Redirect(w, r, "/login", http.StatusFound)
				}
				// check privilege of user_id with restaurant_id in restaurant_users table
				var user_privilege string
				err = db.QueryRow(`
					SELECT privilege FROM restaurant_users 
						WHERE user_id=$1 AND restaurant_id=$2;`,
					user_id, restaurant_id).Scan(&user_privilege)
				if err != nil {
					log.Println(err.Error())
					http.Error(w, err.Error(), http.StatusBadRequest)
					http.Redirect(w, r, "/login", http.StatusFound)
				}

				// "admin" is highest privilege, always pass through
				if user_privilege == g_admin_privilege || user_privilege == req_privilege {
					f(w, r)
				} else {
					http.Error(w, "Insufficient privilege!", http.StatusUnauthorized)
				}
			}
		} else {
			log.Println("USER ID NOT OKAY")
			// if user_id is not a string type
			http.Redirect(w, r, "/login", http.StatusFound)
		}
	}
}

func sessionHandlerDecorator(h http.Handler) http.Handler {
	return http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			loginSession, err := session_store.Get(r, "loginSession")
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			// check for email key to verify is valid user
			// Set session values for identification
			if val, ok := loginSession.Values["email"].(string); ok {
				// if val is a string
				switch val {
				case "":
					//http.ServeFile(w, r, "login.html")
					http.Redirect(w, r, "/login", http.StatusFound)
				default:
					log.Println("Decorator validated email:")
					log.Println(val)
					h.ServeHTTP(w, r) // call function here
				}
			} else {
				// if val is not a string type
				http.Redirect(w, r, "/login", http.StatusFound)
				//http.ServeFile(w, r, "login.html")
			}
		})
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {

	loginSession, err := session_store.Get(r, "loginSession")
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	loginSession.Values["email"] = ""
	loginSession.Values["id"] = ""
	err = loginSession.Save(r, w)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/login", http.StatusFound)

}

func LoginHandler(w http.ResponseWriter, r *http.Request) {

	switch r.Method {
	case "GET":
		http.ServeFile(w, r, "./login.html")

	case "POST":

		email := r.FormValue("email")
		password := r.FormValue("password")

		log.Println(email)
		log.Println(password)

		var pw_hash string
		err := db.QueryRow(`
		SELECT pw_hash FROM users WHERE email=$1 AND active=TRUE;`,
			email).Scan(&pw_hash)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		err = bcrypt.CompareHashAndPassword([]byte(pw_hash), []byte(password))
		// err == nil means it's a match
		if err != nil {
			log.Println("No match found!")
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println("MATCH FOUND")

		var user User
		err = db.QueryRow(`
		SELECT id, email, first FROM users 
		WHERE email=$1 AND active=TRUE;`,
			email).Scan(&user.ID, &user.Email, &user.FirstName)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		// update user.last_seen
		cur_time := time.Now().UTC()
		_, err = db.Exec(`
		UPDATE users SET last_seen=$1 WHERE id=$2;`,
			cur_time, user.ID)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Now need to generate a session and return to the user, then redirect them to
		// the app
		newSession, err := session_store.Get(r, "loginSession")
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Set session values for identification
		newSession.Values["email"] = email
		newSession.Values["id"] = strconv.Itoa(user.ID)
		err = newSession.Save(r, w)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// redirect the user to app
		http.Redirect(w, r, "inventory/app.html", http.StatusFound)
	}
}

func SignUpHandler(w http.ResponseWriter, r *http.Request) {
	first_name := r.FormValue("first_name")
	last_name := r.FormValue("last_name")
	email := r.FormValue("email")
	password := r.FormValue("password")
	cur_time := time.Now().UTC()

	password_hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var user_id int
	err = db.QueryRow(`
		INSERT INTO users(first, last, email, pw_hash, member_since, active) 
		VALUES($1, $2, $3, $4, $5, TRUE) RETURNING id;`,
		first_name, last_name, email, password_hash, cur_time).Scan(&user_id)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Now need to generate a session and return to the user, then redirect them to
	// the app
	newSession, err := session_store.Get(r, "loginSession")
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Set session values for identification
	newSession.Values["email"] = email
	err = newSession.Save(r, w)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// redirect the user to app
	http.Redirect(w, r, "inventory/app.html", http.StatusFound)

}
