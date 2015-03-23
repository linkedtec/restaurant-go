'use strict';

angular.module('myApp.viewInvByLoc', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewInvByLoc', {
    templateUrl: 'view_loc/view_loc.html',
    controller: 'ViewInvByLocCtrl'
  });
}])

.controller('ViewInvByLocCtrl', function($scope, $http) {

  $scope.add_loc = false;        // add new location mode
  $scope.locations = [];        // all locations
  $scope.empty_locs = false;    // are locations empty?
  $scope.selected_loc = null;   // name of the selected location
  $scope.empty_inv = false;      // is location inventory empty?
  $scope.add_inv = false;       // add new inv item mode
  $scope.add_inv_existing_items = [];
  $scope.new_inv_msg = "";      // dialog box for adding inventory status
  $scope.inv_items = [];

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

      $scope.locations.push(
        {
          name: "+ New",
          is_add: true
        }
      );

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

    if (loc.name == $scope.selected_loc)
    {
      return;
    }

    $scope.selected_loc = loc.name;
    $scope.add_inv = false;
    $scope.getLocInv();
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
        $scope.locations.push({name:loc});
        $scope.locations.push(add_new_loc[0]);
        $scope.empty_locs = false;
        $scope.new_loc = "";
        $scope.add_loc = false;
        $scope.selectLoc({name:loc});
      }).
      error(function(data, status, headers, config) {
    });
  };

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.add_inv=true;
    $scope.new_inv_msg = "";

    if ($scope.add_inv_existing_items.length == 0)
    {
      $scope.getExistingInv();
    }
  };

  $scope.hideAddInv = function() {
    $scope.add_inv=false;
  };

  // item is a string here...
  $scope.addNewInv = function(item) {
    console.log ('add item: ' + item);
    // check if empty
    if (item == undefined || item =='')
    {
      swal({
        title:"Empty Name", 
        text: "Please enter an item name!",
        timer: 1500});
      return;
    }
    // XXX check if item already in all inventory items
    // NEED TO IMPLEMENT THIS
    $http.post('/inv/loc', {
      name:item, 
      unit:"unit",
      location: $scope.selected_loc,
      quantity: 1,
      unit_price: 0}).
      success(function(data, status, headers, config) {
        console.log(data);
        // XXX push new item onto location's inventory items
        // XXX if new item not in all inventory, push into
        $scope.new_inv = "";
        $scope.new_inv_msg = item + " was added to " + $scope.selected_loc;
        $scope.getLocInv();
      }).
      error(function(data, status, headers, config) {
    });
  };

  // item is an object here
  $scope.addExistingInv = function(item) {
    console.log ('add existing item: ' + item.name);

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

    $http.post('/inv/loc', {
      name:item.name, 
      unit:item.unit,
      location: $scope.selected_loc,
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price)}).
      success(function(data, status, headers, config) {
        console.log(data);
        // XXX push new item onto location's inventory items
        // XXX if new item not in all inventory, push into
        $scope.new_inv = "";
        $scope.new_inv_msg = item.name + " was added to " + $scope.selected_loc;
        $scope.getLocInv();
        // XXX remove added item from $scope.add_inv_existing_items manually
        for ( var i=$scope.add_inv_existing_items.length-1; i >= 0; i--) {
          if ( $scope.add_inv_existing_items[i].name == item.name &&
            $scope.add_inv_existing_items[i].unit == item.unit) {
            $scope.add_inv_existing_items.splice(i, 1);
          }
        }
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
      text: "This will remove " + item.name + " from " + $scope.selected_loc + ".\n\n  It will not affect other locations which carry the item, and the item will still be accessible from the All Inventory list.",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/inv/loc', {
          params: {
            name:item.name,
            unit:item.unit,
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
        $scope.add_inv_existing_items = data;
        // On the client side, remove any entries in add_inv_existing_items
        // which are already in this location
        var clean_existing = [];
        for (var i=0; i < $scope.add_inv_existing_items.length; i++) {
          var is_clean = true;
          var test_item = $scope.add_inv_existing_items[i];
          for (var j=0; j < $scope.inv_items.length; j++) {
            var check_item = $scope.inv_items[j];
            if (test_item.name == check_item.name && test_item.unit == check_item.unit)
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
      }
      else {
        $scope.add_inv_existing_items = [];
      }
    }).
    error(function(data, status, headers, config) {

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

});