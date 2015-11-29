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

type RestaurantInvEmail struct {
	RestaurantID int        `json:"restaurant_id"`
	Email        NullString `json:"email"`
}

type Restaurant struct {
	Name            NullString `json:"name"`
	PurchaseContact NullString `json:"purchase_contact"`
	PurchaseEmail   NullString `json:"purchase_email"`
	PurchasePhone   NullString `json:"purchase_phone"`
	PurchaseFax     NullString `json:"purchase_fax"`
}

type RestaurantAddress struct {
	Type       NullString `json:"type"`
	AddressOne NullString `json:"address_one"`
	AddressTwo NullString `json:"address_two"`
	City       NullString `json:"city"`
	State      NullString `json:"state"`
	Zipcode    NullString `json:"zipcode"`
}

func setupUsersHandlers() {
	http.HandleFunc("/users/inv_email", usersInvEmailAPIHandler)
	// we separate name and purchase because the privilege levels for these differ
	http.HandleFunc("/restaurant/name", restaurantNameAPIHandler)
	http.HandleFunc("/restaurant/address", restaurantAddressAPIHandler)
	http.HandleFunc("/restaurant/purchase", restaurantPurchaseAPIHandler)

}

func checkUserPrivilege() string {
	// check user_id against restaurant_users to see whether they have
	// privileges to see this admin screen
	var privilege string
	err := db.QueryRow("SELECT privilege FROM restaurant_users WHERE restaurant_id=$1 AND user_id=$2;", test_restaurant_id, test_user_id).Scan(&privilege)
	if err != nil {
		log.Println(err.Error())
		return "error"
	}

	return privilege
}

func hasBasicPrivilege(p string) bool {
	if p != "admin" && p != "basic" {
		return false
	}
	return true
}

func hasAdminPrivilege(p string) bool {
	return p == "admin"
}

func restaurantNameAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {
	case "GET":
		// privilege: anyone can GET the restaurant name...

		var restaurant Restaurant
		err := db.QueryRow("SELECT name FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(&restaurant.Name)
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&restaurant)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "PUT":
		// privilege: only the admin can post restaurant name
		if !hasAdminPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var restaurant Restaurant

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&restaurant)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(restaurant)

		_, err = db.Exec("UPDATE restaurants SET name=$1 WHERE id=$2", restaurant.Name, test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}

func restaurantAddressAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {
	case "GET":
		// privilege: anyone can GET restaurant address

		addr_type := r.URL.Query().Get("type")

		var address RestaurantAddress

		var err error
		if addr_type == "delivery" {
			err = db.QueryRow("SELECT delivery_addr1, delivery_addr2, delivery_city, delivery_state, delivery_zipcode FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
				&address.AddressOne,
				&address.AddressTwo,
				&address.City,
				&address.State,
				&address.Zipcode)
		} else {
			err = db.QueryRow("SELECT addr1, addr2, city, state, zipcode FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
				&address.AddressOne,
				&address.AddressTwo,
				&address.City,
				&address.State,
				&address.Zipcode)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&address)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "POST":
		// privilege: only the admin can post restaurant name
		if !hasAdminPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var address RestaurantAddress

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&address)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(address)

		if address.Type.Valid && address.Type.String == "delivery" {
			_, err = db.Exec("UPDATE restaurants SET delivery_addr1=$1, delivery_addr2=$2, delivery_city=$3, delivery_state=$4, delivery_zipcode=$5 WHERE id=$6", address.AddressOne, address.AddressTwo, address.City, address.State, address.Zipcode, test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			_, err = db.Exec("UPDATE restaurants SET addr1=$1, addr2=$2, city=$3, state=$4, zipcode=$5 WHERE id=$6", address.AddressOne, address.AddressTwo, address.City, address.State, address.Zipcode, test_restaurant_id)
			if err != nil {
				log.Println(err.Error())
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}
}

// restaurantAPIHandler is an admin screen, need to check user_id
// and credentials has access to admin info via the restaurant_users table
func restaurantPurchaseAPIHandler(w http.ResponseWriter, r *http.Request) {
	privilege := checkUserPrivilege()

	switch r.Method {
	case "GET":
		// only basic privileged users can access this info
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var restaurant Restaurant
		err := db.QueryRow("SELECT purchase_contact, purchase_email, purchase_phone, purchase_fax FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(
			&restaurant.PurchaseContact,
			&restaurant.PurchaseEmail,
			&restaurant.PurchasePhone,
			&restaurant.PurchaseFax)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		js, err := json.Marshal(&restaurant)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(js)

	case "PUT":
		// only basic privileged users can access this info
		if !hasBasicPrivilege(privilege) {
			http.Error(w, "You lack privileges for this action!", http.StatusInternalServerError)
			return
		}

		var restaurant Restaurant

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&restaurant)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		log.Println(restaurant)

		_, err = db.Exec("UPDATE restaurants SET purchase_contact=$1, purchase_email=$2, purchase_phone=$3, purchase_fax=$4 WHERE id=$5", restaurant.PurchaseContact, restaurant.PurchaseEmail, restaurant.PurchasePhone, restaurant.PurchaseFax, test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}

func usersInvEmailAPIHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":

		// XXX In future also replace this with proper authentication
		//restaurant_id := r.URL.Query().Get("restaurant_id")

		var ret_user_email RestaurantInvEmail
		err := db.QueryRow("SELECT inv_email_recipient FROM restaurants WHERE id=$1;", test_restaurant_id).Scan(&ret_user_email.Email)
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

		// also need to fix test_restaurant_id case here
		var restaurant_email RestaurantInvEmail
		log.Println("Received post")

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&restaurant_email)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		_, err = db.Exec("UPDATE restaurants SET inv_email_recipient=$1 WHERE id=$2", restaurant_email.Email, test_restaurant_id)
		if err != nil {
			log.Println(err.Error())
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}
}
