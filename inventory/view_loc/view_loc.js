'use strict';

angular.module('myApp.viewInvByLoc', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewInvByLoc', {
    templateUrl: 'view_loc/view_loc.html',
    controller: 'ViewInvByLocCtrl'
  });
}])

.controller('ViewInvByLocCtrl', function($scope, $http) {

  $scope.add_loc = false;       // add new location mode
  $scope.edit_loc = false;      // edit location mode
  $scope.locations = [];        // all locations
  $scope.empty_locs = false;    // are locations empty?
  $scope.selected_loc = null;   // name of the selected location
  $scope.edit_loc_name = null;  
  $scope.last_update = null;    // last update text
  $scope.empty_inv = false;     // is location inventory empty?
  $scope.add_inv = false;       // add new inv item mode
  $scope.add_inv_all_items = [];  // a cache from server of all inv items
  $scope.add_inv_existing_items = [];  // all_items minus existing items in location
  $scope.new_success_msg = null;
  $scope.inv_items = [];
  $scope.inv_started = false;
  $scope.update_failure_msg = "";

  // get locations, if empty, set $scope.empty_locs = true
  $http.get('/loc').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data == null)
      {
        $scope.locations = [];
      }
      else
      {
        $scope.locations = data;
      }

      // Check the last_update field of storage locations and add a readable
      // field for when it was last updated, called "last_update_pretty"
      for (var loc_i in $scope.locations) {
        var loc = $scope.locations[loc_i];
        console.log(loc.last_update);
        var mins_since_update = $scope.getMinutesSinceTime(loc.last_update);
        var years_since_update = mins_since_update / 60 / 24 / 365;

        // if years_since_update is greater than 50, we know this is 
        // a bogus timestamp
        var pretty_time = null;
        if (years_since_update > 50) {
          ;
        } else {
          if (mins_since_update < 5) {
            pretty_time = 'Moments ago';
          } else if (mins_since_update < 60) {
            pretty_time = parseInt(mins_since_update).toString() + ' minutes ago';
          } else if (mins_since_update < 24*60) {
            pretty_time = parseInt(mins_since_update / 60).toString() + ' hours ago';
          } else if (mins_since_update < 24*60*2) {
            pretty_time = 'Yesterday'
          } else {
            pretty_time = parseInt(mins_since_update/24/60).toString() + ' days ago';
          }
        }
        $scope.locations[loc_i]['last_update_pretty'] = pretty_time;
      }

      // Add the + New button for creating new locations
      $scope.locations.push(
        {
          name: "+ New",
          is_add: true
        }
      );

      console.log($scope.locations);

      if ($scope.locations.length == 1)
      {
        // setting empty_locs will tell the UI to draw the first-time
        // add new location helper
        $scope.empty_locs = true;
      }
    }).
    error(function(data, status, headers, config) {

    });

  $scope.selectLoc = function(loc) {
    console.log(loc.name);

    if (loc.name == $scope.selected_loc)
    {
      return;
    }

    $scope.inv_started = false;

    // check if the location is the "+ New" button for creating a new location
    if (loc.is_add === true) {
      if ($scope.add_loc === true)
      {
        $scope.add_loc = false;
      } else {
        $scope.add_loc = true;
      }
      return;
    }

    $scope.selected_loc = loc.name;
    $scope.add_inv = false;
    $scope.getLocInv();
    $scope.last_update = loc.last_update_pretty;
    $scope.add_loc = false;       // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.empty_locs = false;    // are locations empty?
    $scope.new_success_msg = null;
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  $scope.hideAddLoc = function() {
    $scope.add_loc=false;
  };

  $scope.addNewLoc = function(loc) {
    console.log('add loc: ' + loc);

    // check if it's empty
    if (loc == undefined || loc == '')
    {
      swal({
        title:"Empty Name", 
        text: "Please enter a location name!",
        timer: 1500});
      return;
    }
    // check if location is already in $scope.locations
    for (var loc_i in $scope.locations) {
      console.log(loc_i);
      var existing = $scope.locations[loc_i];
      if (existing.name == loc)
      {
        console.log(loc + ' is already in system!');
        // XXX Change this to red text on page instead of alert
        swal({
        title:"Location Exists", 
        text: loc + " is already in the system!!"});
        $scope.new_loc = "";
        return;
      }
    }
    $http.post('/loc', {name:loc}).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        console.log(data);
        // XXX if success, add returned item to $scope.inventory_items
        // otherwise, notify of failure and don't add
        // First, remove the "+ New" element at the end
        var add_new_loc = $scope.locations.splice(-1, 1);
        var new_loc_obj = {name:loc, last_update:null, last_update_pretty:null};
        $scope.locations.push(new_loc_obj);
        $scope.locations.push(add_new_loc[0]);
        $scope.empty_locs = false;
        $scope.new_loc = "";
        $scope.add_loc = false;
        $scope.selectLoc(new_loc_obj);
      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.toggleEditLoc = function() {
    if ($scope.edit_loc) {
      $scope.edit_loc = false;
    } else {
      $scope.edit_loc=true;
      $scope.edit_loc_name = $scope.selected_loc;
    }
  };

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.add_inv=true;
    $scope.new_success_msg = null;

    if ($scope.add_inv_all_items.length == 0)
    {
      $scope.getExistingInv();
    } else {
      $scope.cleanUpExistingInv();
    }
  };

  $scope.hideAddInv = function() {
    $scope.add_inv=false;
  };

  // item is an object here
  $scope.addExistingInv = function(item) {
    console.log ('add existing item: ' + item.product);

    $http.post('/inv/loc', {
      id:item.id, 
      location: $scope.selected_loc}).
      success(function(data, status, headers, config) {
        console.log(data);
        // XXX push new item onto location's inventory items
        // XXX if new item not in all inventory, push into
        $scope.new_success_msg = item.product + " has been added to " + $scope.selected_loc + "!";
        item.quantity = 0;
        $scope.inv_items.push(item);
        //$scope.getLocInv();
        // XXX remove added item from $scope.add_inv_existing_items manually
        for ( var i=$scope.add_inv_existing_items.length-1; i >= 0; i--) {
          if ( $scope.add_inv_existing_items[i].id == item.id) {
            $scope.add_inv_existing_items.splice(i, 1);
          }
        }

        $scope.empty_inv = false;
      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.updateInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];

    if (item.quantity=="" || item.quantity == null)
    {
      swal({
        title:"Empty Quantity", 
        text: "Please enter a Quantity for " + item.name + "!"});
      return;
    }
    if (item.unit_price=="" || item.unit_price == null)
    {
      swal({
        title:"Empty Unit Price", 
        text: "Please enter a Unit Price for " + item.name + "!"});
      return;
    }

    if (isNaN(item.quantity))
    {
      swal({
        title:"Invalid Quantity: " + item.quantity, 
        text: "Please check that " + item.name + "'s Quantity is a valid number!"});
      return;
    }
    if (isNaN(item.unit_price))
    {
      swal({
        title:"Invalid Unit Price: " + item.unit_price, 
        text: "Please check that " + item.name + "'s Unit Price is a valid number!"});
      return;
    }

    $http.put('/inv/loc', {
      name:item.name,
      unit:item.unit,
      location:$scope.selected_loc,
      quantity:item.quantity,
      unit_price:item.unit_price
    });
    $scope.inv_items[index]["updated_today"] = true;

  };

  $scope.removeInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];
    swal({
      title: "Remove Item?",
      text: "This will remove " + item.product + " from " + $scope.selected_loc + ".  It will not affect other locations which carry the item, or its entry in the Beverage DB.",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/inv/loc', {
          params: {
            id:item.id,
            location:$scope.selected_loc
          }
        }).
        success(function(data, status, headers, config) {
          $scope.getLocInv();
          swal("Removed!", item.name + " has been removed.", "success");
        }).
        error(function(data, status, headers, config) {

        });
      });
    
  };

  $scope.cleanUpExistingInv = function() {
    // On the client side, remove any entries in add_inv_existing_items
    // which are already in this location
    var clean_existing = [];
    for (var i=0; i < $scope.add_inv_all_items.length; i++) {
      var is_clean = true;
      var test_item = $scope.add_inv_all_items[i];
      for (var j=0; j < $scope.inv_items.length; j++) {
        var check_item = $scope.inv_items[j];
        if (test_item.id == check_item.id)
        {
          is_clean = false;
          break;
        }
      }
      if (is_clean) {
        clean_existing.push(test_item);
      }
    }
    $scope.add_inv_existing_items = clean_existing;
  };

  $scope.getExistingInv = function() {
    $http.get('/inv', {
      params: {
        name:$scope.selected_loc
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.add_inv_all_items = data;
      }
      else {
        $scope.add_inv_all_items = [];
      }
      $scope.cleanUpExistingInv();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.startInv = function() {
    $scope.inv_started = true;

    // Create a backup of all quantities of inventory items with object
    // with keys of item id and values of id quantity.  If user cancels
    // inventory without saving, restore this
    $scope.inv_quantity_backup = {};
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      $scope.inv_quantity_backup[inv.id] = inv.quantity;
    };
    console.log($scope.inv_quantity_backup);
  };

  $scope.saveInv = function() {

    var hasNaNs = false;
    // first check that all update quantities are valid numbers
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      if (isNaN(inv.quantity) || inv.quantity < 0) {
        $scope.inv_items[inv_i]['invalid_quantity'] = true;
        hasNaNs = true;
      }
      else {
        $scope.inv_items[inv_i]['invalid_quantity'] = false;
      }
    }
    if (hasNaNs) {
      $scope.update_failure_msg = "Please fix invalid quantities highlighted in red and try again!";
      return;
    }

    $scope.update_failure_msg = "";


    // inv_started shows the quantity adjustment UI
    $scope.inv_started = false;

    var post_item_quantities = []
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      console.log(inv.product);
      console.log(inv.quantity);
      post_item_quantities.push({id:inv.id, quantity:parseFloat(inv.quantity)})
      $scope.inv_items[inv_i]['invalid_quantity'] = false;
      $scope.inv_items[inv_i]['add_q'] = null;
    };

    $http.put('/inv/loc', {
      items:post_item_quantities,
      location:$scope.selected_loc
    });
  }

  $scope.cancelInv = function() {
    $scope.inv_started = false;
    $scope.update_failure_msg = "";

    // restore backup quantities
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      if (inv.id in $scope.inv_quantity_backup) {
        console.log('apply backup');
        console.log($scope.inv_items[inv_i].quantity);
        $scope.inv_items[inv_i].quantity = $scope.inv_quantity_backup[inv.id];
        $scope.inv_items[inv_i]['invalid_quantity'] = false;
        $scope.inv_items[inv_i]['add_q'] = null;
      }
    }
  }

  $scope.addQuantity = function(inv, num, isAddQ) {

    if (isNaN(num) || num === null) {
      if (isAddQ) {
        inv.add_q = null;
      }
      return;
    }

    var cur_quantity = parseFloat(inv.quantity);
    var add_num = parseFloat(num);

    inv.quantity = cur_quantity + add_num;

    if (inv.quantity < 0) {
      inv.quantity = 0;
    }

    if (isAddQ) {
      inv.add_q = null;
    }
  };

  $scope.saveLocName = function() {
    // First verify new name does not overlap with other locations
    for (var i = 0; i < $scope.locations.length; i++) {
      var loc = $scope.locations[i];
      if ($scope.edit_loc_name == loc.name) {
        swal({
          type: "warning",
          title:"Name Exists", 
          text: "There is already a location named " + $scope.edit_loc_name + ", please choose another name!"});
        return;
      }
    }

    $http.put('/loc', {
      name:$scope.selected_loc,
      new_name:$scope.edit_loc_name
    }).
    success(function(data, status, headers, config) {
      // update the local location with the new name
      for (var i = 0; i < $scope.locations.length; i++) {
        var loc = $scope.locations[i];
        if (loc.name == $scope.selected_loc) {
          loc.name = $scope.edit_loc_name;
        }
      }
      $scope.selected_loc = $scope.edit_loc_name
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.deleteLoc = function() {
    swal({
      title: "Delete this Location?",
      text: "This will remove " + $scope.selected_loc + " and all its inventory data, and cannot be undone.",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/loc', {
          params: {
          location:$scope.selected_loc
        }
      }).
      success(function(data, status, headers, config) {
        for (var i = $scope.locations.length-1; i >= 0; i--) {
          var loc = $scope.locations[i];
          if (loc.name === $scope.selected_loc) {
            $scope.locations.splice(i, 1);
          }
        }
        $scope.selected_loc = null;
      }).
      error(function(data, status, headers, config) {

      });
    });
  };

  $scope.getLocInv = function() {
    $http.get('/inv/loc', {
      params: {
        name:$scope.selected_loc
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.inv_items = data;
      }
      else {
        $scope.inv_items = [];
      }

      // add a custom 'invalid_quantity' key for quantity update UI so we can 
      // display red input boxes if quantity is not a number
      for (var i = 0; i < $scope.inv_items.length; i++)
      {
        $scope.inv_items[i]['invalid_quantity'] = false;
        $scope.inv_items[i]['add_q'] = null;
      }

      // check last_update in each inventory item and if updated within 24
      // hours, add key "updated_today": true
      for (var i = 0; i < $scope.inv_items.length; i++)
      {
        var last_update_str = $scope.inv_items[i]["last_update"];

        // e.g., 2015-03-16
        var date_str = last_update_str.substring(0,last_update_str.indexOf('T'));
        // e.g., 07:43:49
        var time_str = last_update_str.substring(
          last_update_str.indexOf('T')+1,
          last_update_str.indexOf('.'));
        var date_comps = date_str.split('-');
        var time_comps = time_str.split(':');
        var last_update = Date.UTC(
          date_comps[0], parseInt(date_comps[1])-1, date_comps[2],
          time_comps[0], time_comps[1], time_comps[2]);
        var dt_sec = (Date.now() - last_update) / 1000.0
        var dt_hour = dt_sec / 60.0 / 60.0
        if (dt_hour < 24)
        {
          $scope.inv_items[i]["updated_today"] = true;
        }
        console.log("last updated " + dt_hour + " hours ago");
        
      }

      if ($scope.inv_items.length == 0) {
        $scope.empty_inv = true;
      } else {
        $scope.empty_inv = false;
      }
      console.log($scope.empty_inv);
    }).
    error(function(data, status, headers, config) {

    });
  };

  // helper function to get the number of minutes since a time stamp
  $scope.getMinutesSinceTime = function(timestamp) {
    // e.g., 2015-03-16
    var date_str = timestamp.substring(0,timestamp.indexOf('T'));
    // e.g., 07:43:49
    // sometimes the timestamp doesn't have a . in it, in which case look
    // to end at the Z, e.g., 0001-01-01T00:00:00Z
    var dot_index = timestamp.indexOf('.');
    if (dot_index < 0) {
      dot_index = 99999;
    }
    var z_index = timestamp.indexOf('Z');
    if (z_index < 0) {
      z_index = 99999;
    }
    var end_index = Math.min(dot_index, z_index);
    var time_str = timestamp.substring(
      timestamp.indexOf('T')+1,
      end_index);
    var date_comps = date_str.split('-');
    var time_comps = time_str.split(':');
    var last_update = Date.UTC(
      date_comps[0], parseInt(date_comps[1])-1, date_comps[2],
      time_comps[0], time_comps[1], time_comps[2]);
    var dt_sec = (Date.now() - last_update) / 1000.0;
    return parseInt(dt_sec / 60.0);
  };


});