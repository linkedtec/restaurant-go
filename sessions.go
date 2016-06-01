package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gorilla/sessions"
	"golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"os"
	"strconv"
	"text/template"
	"time"
)

var session_store = sessions.NewCookieStore([]byte("bevapp-sessions-secret"))

const g_basic_privilege = "basic"
const g_admin_privilege = "admin"

const ERR_RET_STR = "-1"
const ERR_UNAUTHORIZED = "UNAUTHORIZED"
const ERR_LOGIN_REQUIRED = "LOGIN_REQUIRED"
const ERR_MISSING_RESTAURANT = "MISSING_RESTAURANT"

// for injecting into templates to client forms, such as login and sign up
type ClientFormMsg struct {
	Message string
}

type MissingRestaurantRequest struct {
	Name       string `json:"name"`
	Restaurant string `json:"restaurant"`
}

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
	// For posting request to email me for restaurant activation:
	http.HandleFunc("/missing_restaurant", sessionDecoratorNoRestaurant(MissingRestaurantHandler))
	// For my own admin use to easily activate a user
	http.HandleFunc("/activate", ActivateUserHandler)

}

// This is the "light-weight" function to call to check user has login
// credentials, only returns boolean and doesn't alter state or send
// HTTP Errors
func sessionCheckUerLoggedIn(w http.ResponseWriter, r *http.Request) bool {
	loginSession, err := session_store.Get(r, "loginSession")
	if err != nil {
		return false
	}
	if val, ok := loginSession.Values["id"].(string); ok {
		// if val is a string
		switch val {
		case "":
			return false
		default:
			return true
		}
	} else {
		return false
	}
	return false
}

// This is the "full-weight" decorator to call when login is required
// to access the underlying content, and will throw HTTP Errors to the client
// to signify failure
func sessionGetUserID(w http.ResponseWriter, r *http.Request) (user_id string, err error) {

	loginSession, err := session_store.Get(r, "loginSession")
	if err != nil {
		log.Println(err.Error())
		http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
		return ERR_RET_STR, err
	}
	if val, ok := loginSession.Values["id"].(string); ok {
		// if val is a string
		switch val {
		case "":
			http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
			return ERR_RET_STR, errors.New("Empty user ID for login session.")
		default:
			return val, nil
		}
	} else {
		http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
		return ERR_RET_STR, errors.New("Missing user ID for login session.")
	}
	http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
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

// No restaurant required for certain calls...
// I hate this organization but adding an extra param to sessionDecorator seems
// extraneous
func sessionDecoratorNoRestaurant(f http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		log.Println("In session decorator no restaurant")

		loginSession, err := session_store.Get(r, "loginSession")
		if err != nil {
			log.Println(err.Error())
			http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
			return
		}

		// check for id key to verify is valid user
		// Set session values for identification
		if user_id, ok := loginSession.Values["id"].(string); ok {

			log.Println("USER ID OKAY")
			log.Println(user_id)

			// if user_id is a string
			switch user_id {
			case "":
				log.Println("EMPTY")
				http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
				return
			default:

				f(w, r)
			}
		} else {
			log.Println("USER ID NOT OKAY")
			http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
		}
	}
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
			http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
			return
		}

		// check for id key to verify is valid user
		// Set session values for identification
		if user_id, ok := loginSession.Values["id"].(string); ok {

			log.Println("USER ID OKAY")
			log.Println(user_id)

			// if user_id is a string
			switch user_id {
			case "":
				log.Println("EMPTY")
				http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
				return
			default:
				log.Println(user_id)
				var restaurant_id int
				err := db.QueryRow(`
					SELECT cur_restaurant FROM users WHERE id=$1 AND active=TRUE;`,
					user_id).Scan(&restaurant_id)
				if err != nil {
					log.Println("No restaurant")
					log.Println(err.Error())
					//http.Error(w, err.Error(), http.StatusBadRequest)
					http.Error(w, ERR_MISSING_RESTAURANT, http.StatusUnauthorized)
					return
				}
				// check privilege of user_id with restaurant_id in restaurant_users table
				var user_privilege string
				err = db.QueryRow(`
					SELECT privilege FROM restaurant_users 
						WHERE user_id=$1 AND restaurant_id=$2;`,
					user_id, restaurant_id).Scan(&user_privilege)
				if err != nil {
					log.Println(err.Error())
					//http.Error(w, err.Error(), http.StatusBadRequest)
					http.Error(w, ERR_UNAUTHORIZED, http.StatusUnauthorized)
					return
				}

				// "admin" is highest privilege, always pass through
				if user_privilege == g_admin_privilege || user_privilege == req_privilege {
					f(w, r)
				} else {
					http.Error(w, ERR_UNAUTHORIZED, http.StatusUnauthorized)
				}
			}
		} else {
			log.Println("USER ID NOT OKAY")
			http.Error(w, ERR_LOGIN_REQUIRED, http.StatusUnauthorized)
		}
	}
}

func sessionHandlerDecorator(h http.Handler) http.Handler {

	log.Println("SESSION HANDLER DECORATOR")

	return http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {

			log.Println("SESSION HANDLER DECORATOR2")

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
					log.Println("EMPTY SESSION HANDLER")
					return
				default:
					log.Println("Decorator validated email:")
					log.Println(val)
					h.ServeHTTP(w, r) // call function here
				}
			} else {
				// if val is not a string type
				http.Redirect(w, r, "/login", http.StatusFound)
				log.Println("SESSION HANDLER REDIRECT")
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

	log.Println("CALLING LOGIN HANDLER")

	switch r.Method {
	case "GET":
		t, err := template.ParseFiles("login.html", "nav.tmpl")
		if err != nil {
			log.Println(err.Error())
		}

		t.Execute(w, nil)

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

			//http.Error(w, err.Error(), http.StatusBadRequest)
			t, err := template.ParseFiles("login.html", "nav.tmpl")
			if err != nil {
				log.Println(err.Error())
			}
			loginError := ClientFormMsg{"email / password invalid, please try again!"}
			err = t.Execute(w, loginError)
			if err != nil {
				log.Println(err.Error())
			}
			return
		}

		err = bcrypt.CompareHashAndPassword([]byte(pw_hash), []byte(password))
		// err == nil means it's a match
		if err != nil {
			log.Println("No match found!")
			t, err := template.ParseFiles("login.html", "nav.tmpl")
			if err != nil {
				log.Println(err.Error())
			}
			loginError := ClientFormMsg{"email / password invalid, please try again!"}
			err = t.Execute(w, loginError)
			if err != nil {
				log.Println(err.Error())
			}
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

	switch r.Method {
	case "GET":
		t, err := template.ParseFiles("signup.html", "nav.tmpl")
		if err != nil {
			log.Println(err.Error())
		}

		t.Execute(w, nil)

	case "POST":
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

		// check if email already exists
		email_exists := false
		_ = db.QueryRow(`
			SELECT EXISTS(SELECT 1 FROM users WHERE email=$1);`,
			email).Scan(&email_exists)
		if email_exists {
			t, err := template.ParseFiles("signup.html", "nav.tmpl")
			if err != nil {
				log.Println(err.Error())
			}
			loginError := ClientFormMsg{email + " is already registered."}
			err = t.Execute(w, loginError)
			if err != nil {
				log.Println(err.Error())
			}
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
		newSession.Values["id"] = strconv.Itoa(user_id)
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

func MissingRestaurantHandler(w http.ResponseWriter, r *http.Request) {

	user_id, err := sessionGetUserID(w, r)
	if err != nil {
		log.Println(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "POST":

		decoder := json.NewDecoder(r.Body)
		var req MissingRestaurantRequest
		err := decoder.Decode(&req)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		fullname := req.Name
		restaurant := req.Restaurant

		if len(fullname) < 4 || len(restaurant) < 3 {
			http.Error(w, "Invalid name or restaurant name!", http.StatusBadRequest)
			return
		}

		var email string
		err = db.QueryRow(`SELECT email FROM users WHERE id=$1;`, user_id).Scan(&email)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		isProduction := os.Getenv("RESTAURANT_PRODUCTION")
		var activate_link string
		if isProduction == "1" {
			activate_link = "http://192.241.217.104:6060/activate"
		} else {
			activate_link = "http://localhost:8080/activate"
		}

		email_title := fmt.Sprintf("Restaurant Activation Request from %s", fullname)
		email_body := fmt.Sprintf("A new user has requested their account be associated with a Restaurant.  Please fulfill within 24 hours.<br/><br/>Full Name: %s<br/>User ID: %s<br/>Account Email: %s<br/>Restaurant: %s<br/><br/>Please go here for BevAppActivate: %s", fullname, user_id, email, restaurant, activate_link)
		err = sendEmail("core433@gmail.com", email_title, email_body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}

func ActivateUserHandler(w http.ResponseWriter, r *http.Request) {

	// No authentication required, needs to know activation password

	switch r.Method {

	case "GET":
		t, err := template.ParseFiles("activate.html", "nav.tmpl")
		if err != nil {
			log.Println(err.Error())
		}

		t.Execute(w, nil)

	case "POST":

		log.Println("Received activate POST")

		user_id := r.FormValue("user_id")
		restaurant_id := r.FormValue("restaurant_id")
		password := r.FormValue("password")
		_is_admin := r.FormValue("is_admin")

		log.Println(user_id)
		log.Println(restaurant_id)

		is_admin := false
		if _is_admin == "1" {
			is_admin = true
		}

		admin_password := "BevAppActivate"
		if password != admin_password {
			http.Error(w, "Invalid admin password", http.StatusBadRequest)
			return
		}

		var user_exists bool
		err := db.QueryRow(`
			SELECT EXISTS(SELECT 1 FROM users WHERE id=$1);`, user_id).Scan(&user_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !user_exists {
			http.Error(w, "Posted user does not exist!", http.StatusBadRequest)
			return
		}

		var restaurant_exists bool
		err = db.QueryRow(`
			SELECT EXISTS(SELECT 1 FROM restaurants WHERE id=$1);`, restaurant_id).Scan(&restaurant_exists)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !restaurant_exists {
			http.Error(w, "Posted restaurant does not exist!", http.StatusBadRequest)
			return
		}

		privilege := g_basic_privilege
		if is_admin {
			privilege = g_admin_privilege
		}

		// 1. Update TABLE restaurant_users to associate user with the restaurant
		_, err = db.Exec(`
			INSERT INTO restaurant_users(
				restaurant_id, user_id, privilege) 
				VALUES($1, $2, $3);`, restaurant_id, user_id, privilege)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// 2. Update user's cur_restaurant in TABLE users
		_, err = db.Exec(`
			UPDATE users SET cur_restaurant=$1 WHERE id=$2;`, restaurant_id, user_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		http.Error(w, "User was successfully activated!", http.StatusOK)

	}
}
