'use strict';

angular.module('myApp.viewEmptyKegs', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewEmptyKegs', {
      templateUrl: 'view_empty_kegs/view_empty_kegs.html',
      controller: 'ViewInvByLocCtrl',
      resolve: {
        locType: function() {
          return "kegs";
        }
      }
    });
}]);
/*
.controller('ViewKegsByLocCtrl', function($scope, $modal, $http, DateService, locType) {

  // XXX DO NOT REASSIGN VALUE OF k_loc_type, it is determined by route
  // to be "bev" or "keg" and is a CONSTANT
  $scope.k_loc_type = locType;

  $scope.show_add_ui = false;  // add new location mode
  $scope.newLocControl = {};
  $scope.edit_loc = false;      // edit location mode
  $scope.editLocControl = {};

  $scope.locations = [];        // all locations
  $scope.selected_loc = null;   // selected location
  $scope.last_update = null;    // last update text
  $scope.add_inv = false;       // add new inv item mode
  $scope.add_inv_all_items = [];  // a cache from server of all inv items
  $scope.add_inv_existing_items = [];  // all_items minus existing items in location
  $scope.total_inventory = 0;
  $scope.new_success_msg = null;
  $scope.inv_items = [];
  $scope.inv_started = false;
  $scope.update_failure_msg = "";

  // querying / filtering
  $scope.add_inv_query = {query:""};

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;
  // sorting add inv area
  $scope.sort_add_key = null;
  $scope.add_double_sort = -1;

  // get locations
  $http.get('/loc', {
      params: {
        type:$scope.k_loc_type
      }
    }).
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
        var pretty_time = DateService.getPrettyTime(loc.last_update);
        $scope.locations[loc_i]['last_update_pretty'] = pretty_time;
      }

      console.log($scope.locations);
      
    }).
    error(function(data, status, headers, config) {

    });

  // Shows the add new location UI box
  $scope.showAddLocation = function() {
    $scope.show_add_ui=true;
  };

  $scope.hideAddLoc = function() {
    $scope.show_add_ui=false;
    $scope.newLocControl.clearNewForm();
  };

  $scope.newLocationCloseOnSave = function(new_loc) {
    // new_loc is the name of the new location
    var new_loc_obj = {name:new_loc, last_update:null, last_update_pretty:null};
    $scope.locations.push(new_loc_obj);
    $scope.selectLoc(new_loc_obj);
    $scope.show_add_ui = false;
  };

  $scope.editLocationCloseOnDelete = function(delete_loc) {
    for (var i = $scope.locations.length-1; i >= 0; i--) {
      var loc = $scope.locations[i];
      if (loc.name === $scope.selected_loc.name) {
        $scope.locations.splice(i, 1);
      }
    }
    $scope.selected_loc = null;
    $scope.clearLocState();
  };

  $scope.clearLocState = function() {
    $scope.add_inv = false;
    $scope.last_update = null;
    $scope.show_add_ui = false;   // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.new_success_msg = null;
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  $scope.selectLoc = function(loc) {
    console.log(loc.name);

    if ( $scope.selected_loc!==null && (loc.name === $scope.selected_loc.name))
    {
      return;
    }

    $scope.inv_started = false;

    $scope.selected_loc = loc;
    $scope.add_inv = false;
    $scope.getLocInv();
    $scope.last_update = loc.last_update_pretty;
    $scope.show_add_ui = false;   // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.new_success_msg = null;
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  $scope.toggleEditLoc = function() {
    if ($scope.edit_loc) {
      $scope.edit_loc = false;
      $scope.editLocControl.clearForm();
    } else {
      $scope.edit_loc=true;
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

    $scope.add_double_sort = null;
    $scope.sortAddBy('distributor');
  };

  $scope.hideAddInv = function() {
    $scope.add_inv=false;
  };

  // item is an object here
  $scope.addExistingInv = function(item) {
    console.log ('add existing item: ' + item.distributor);

    $http.post('/kegs/loc', {
      id:item.keg_id, 
      location: $scope.selected_loc.name,
      type:$scope.k_loc_type}).
      success(function(data, status, headers, config) {

        console.log(data);

        var item_clone = JSON.parse( JSON.stringify( item ) );

        // XXX push new item onto location's inventory items
        // XXX if new item not in all inventory, push into
        $scope.new_success_msg = item_clone.distributor + " has been added to " + $scope.selected_loc.name + "!";
        item_clone['quantity'] = 0;
        item_clone['inventory'] = 0;

        if (data !== null && typeof data === 'object') {
          if ('quantity' in data) {
            item_clone.quantity = data['quantity'];
          }
          if ('inventory' in data) {
            item_clone.inventory = data['inventory'];
          }
        }

        $scope.inv_items.push(item_clone);
        //$scope.getLocInv();
        // XXX remove added item from $scope.add_inv_existing_items manually
        for ( var i=$scope.add_inv_existing_items.length-1; i >= 0; i--) {
          if ( $scope.add_inv_existing_items[i].id === item.id) {
            $scope.add_inv_existing_items.splice(i, 1);
          }
        }
      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.removeInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];
    swal({
      title: "Remove Item?",
      text: "This will remove <b>" + item.product + "</b> from " + $scope.selected_loc.name + ".<br/><br/>It will not affect other locations which carry the item, or its entry in the Beverage DB.",
      type: "warning",
      html: true,
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/inv/loc', {
          params: {
            id:item.id,
            location:$scope.selected_loc.name,
            type:$scope.k_loc_type
          }
        }).
        success(function(data, status, headers, config) {
          $scope.getLocInv();
          swal("Removed!", item.name + " has been removed.", "success");

          // push item back into add_inv_existing_items
          item['inventory'] = 0;
          item['quantity'] = 0;
          $scope.add_inv_existing_items.push(item);
          // re-sort the added items twice to refresh sorting
          $scope.sortAddBy($scope.sort_add_key);
          $scope.sortAddBy($scope.sort_add_key);
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
        if (test_item['version_id'] == check_item['version_id'])
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
    var getParams = {name:$scope.selected_loc.name};
    // if this is empty kegs storage, filter on server for container_type "keg"
    if ($scope.k_loc_type === "kegs") {
      getParams["container_type"] = "Keg";
    }
    $http.get('/kegs').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.add_inv_all_items = data;
        for (var i in $scope.add_inv_all_items) {
          $scope.add_inv_all_items['inventory'] = 0;
          $scope.add_inv_all_items['quantity'] = 0;
        }
      }
      else {
        $scope.add_inv_all_items = [];
      }
      $scope.cleanUpExistingInv();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.promptStartInv = function() {

    // XXX If all quantities are 0, directly go to startInv starting from scratch
    // without prompting
    var total_qty = 0;
    for (var i in $scope.inv_items) {
      total_qty += $scope.inv_items[i]['quantity'];
    }
    if (total_qty <= 0) {
      $scope.startInv(true);
      return;
    }

    var modalStartInstance = $modal.open({
      templateUrl: 'startCountModal.html',
      controller: 'startCountModalCtrl',
      windowClass: 'start-count-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'md',
      resolve: {
        
      }
    });

    modalStartInstance.result.then(
      // success status
      function( mode ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        if (mode === 'scratch') {
          $scope.startInv(true);
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (mode === 'previous') {
          $scope.startInv(false);
        }
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.startInv = function(from_scratch) {
    $scope.inv_started = true;

    // Create a backup of all quantities of inventory items with object
    // with keys of item id and values of id quantity.  If user cancels
    // inventory without saving, restore this
    $scope.inv_quantity_backup = {};
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      $scope.inv_quantity_backup[inv.id] = inv.quantity;

      if (from_scratch) {
        $scope.inv_items[inv_i]['quantity'] = 0; 
      }
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

    $scope.total_inventory = 0;
    var post_item_quantities = []
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      console.log(inv.product);
      console.log(inv.quantity);
      post_item_quantities.push({id:inv.id, quantity:parseFloat(inv.quantity)})
      $scope.inv_items[inv_i]['invalid_quantity'] = false;
      $scope.inv_items[inv_i]['add_q'] = null;

      var value = 0;
      // We locally calculate the new inventory without polling the server
      if ($scope.k_loc_type === "bev") {
        value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];
      }
      // always include deposits in value
      if (inv['deposit'] != null) {
        value += inv['deposit'] * inv['quantity'];
      }
      $scope.inv_items[inv_i]['inventory'] = value;
      $scope.inv_items[inv_i]['out_of_date'] = null;
      $scope.total_inventory += value;

      // locally calculate unit_cost for sorting purposes
      var purchase_cost = 0;
      var purchase_count = 1;
      var deposit = 0;
      if (inv['purchase_cost'] !== null) {
        purchase_cost = inv['purchase_cost'];
      }
      if (inv['purchase_count'] !== null) {
        purchase_count = inv['purchase_count'];
      }
      if (inv['deposit'] !== null) {
        deposit = inv['deposit'];
      }
      if ($scope.k_loc_type === "bev") {
        $scope.inv_items[inv_i]['unit_cost'] = purchase_cost / purchase_count + deposit;
      } else {
        $scope.inv_items[inv_i]['unit_cost'] = deposit;
      }
    };

    $http.put('/inv/loc', {
      items:post_item_quantities,
      location:$scope.selected_loc.name,
      type:$scope.k_loc_type
    }).
    success(function(data, status, headers, config) {
      console.log(data);
      swal({
        title: "Inventory Saved!",
        text: "Well done, another inventory location down!",
        type: "success",
        timer: 3000,
        allowOutsideClick: true,
        html: true});
      // server redundantly returns total inventory, set it just in case
      $scope.total_inventory = data['total_inventory'];
      // for the selected location, set last_update locally to just now
      for (var i = 0; i < $scope.locations.length; i++) {
        var loc = $scope.locations[i];
        if (loc.name === $scope.selected_loc.name){
          $scope.locations[i].last_update = data['last_update'];
          var pretty_time = DateService.getPrettyTime(data['last_update']);
          $scope.locations[i]['last_update_pretty'] = pretty_time;
          $scope.last_update = pretty_time;
          break;
        }
      };

      // Call get loc inv to guarantee correct values for line items
      $scope.getLocInv()
    }).
    error(function(data, status, headers, config) {

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

  $scope.getLocInv = function() {
    $http.get('/inv/loc', {
      params: {
        name:$scope.selected_loc.name,
        type:$scope.k_loc_type
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

      // calculate total inventory and unit_cost
      $scope.total_inventory = 0;
      for (var inv_i = 0; inv_i < $scope.inv_items.length; inv_i++)
      {
        var inv = $scope.inv_items[inv_i];

        var value = 0;
        // server has been updated to return inventory value
        if (inv['inventory'] !== null) {
          value = inv['inventory'];
        } else {
          // for old entries which might lack inventory value, do some potentially
          // inaccurate calculations here
          if ($scope.k_loc_type === "bev") {
            value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];
          }
          // always include deposits in value
          if (inv['deposit'] != null) {
            value += inv['deposit'] * inv['quantity'];
          }
        }
        $scope.inv_items[inv_i]['inventory'] = value;
        $scope.total_inventory += value;

        // locally calculate unit_cost for sorting purposes
        var purchase_cost = 0;
        var purchase_count = 1;
        var deposit = 0;
        if (inv['purchase_cost'] !== null) {
          purchase_cost = inv['purchase_cost'];
        }
        if (inv['purchase_count'] !== null) {
          purchase_count = inv['purchase_count'];
        }
        if (inv['deposit'] !== null) {
          deposit = inv['deposit'];
        }
        if ($scope.k_loc_type === "bev") {
          $scope.inv_items[inv_i]['unit_cost'] = purchase_cost / purchase_count + deposit;
        } else {
          $scope.inv_items[inv_i]['unit_cost'] = deposit;
        }
      }

      // check update in each inventory item and if updated within 24
      // hours, add key "updated_today": true
      for (var i = 0; i < $scope.inv_items.length; i++)
      {
        var update_str = $scope.inv_items[i]["update"];

        // e.g., 2015-03-16
        var date_str = update_str.substring(0,update_str.indexOf('T'));
        // e.g., 07:43:49
        var time_str = update_str.substring(
          update_str.indexOf('T')+1,
          update_str.indexOf('.'));
        var date_comps = date_str.split('-');
        var time_comps = time_str.split(':');
        var update = Date.UTC(
          date_comps[0], parseInt(date_comps[1])-1, date_comps[2],
          time_comps[0], time_comps[1], time_comps[2]);
        var dt_sec = (Date.now() - update) / 1000.0
        var dt_hour = dt_sec / 60.0 / 60.0
        if (dt_hour < 24)
        {
          $scope.inv_items[i]["updated_today"] = true;
        }
        console.log("last updated " + dt_hour + " hours ago");
        
      }

      if ($scope.firstTimeSort) {
        $scope.firstTimeSort = false;
        $scope.sortBy('product');
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.sortAddBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_add_key;
    if (double_sort) {
      $scope.add_double_sort *= -1;
    } else {
      $scope.add_double_sort = -1;
    }
    $scope.sort_add_key = sort_str;
    //var isNum = (sort_str === 'unit_cost' || sort_str === 'quantity' || sort_str === 'inventory' || sort_str === 'deposit');
    var isNum = false;

    $scope.add_inv_existing_items.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if ($scope.add_double_sort > 0) {
        if (keyA === null) {
          return -1;
        } else if (keyB === null) {
          return 1;
        }
        if (isNum)
        {
          return parseFloat(keyA) - parseFloat(keyB);
        } else {
          return -keyA.localeCompare(keyB);
        }
      }
      if (keyA === null) {
        return 1;
      } else if (keyB === null) {
        return -1;
      }
      if (isNum)
      {
        return parseFloat(keyB) - parseFloat(keyA);
      } else {
        return keyA.localeCompare(keyB);
      }
    });
  };

  $scope.sortBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key;
    if (double_sort) {
      $scope.double_sort *= -1;
    } else {
      $scope.double_sort = -1;
    }
    $scope.sort_key = sort_str;
    var isNum = (sort_str === 'unit_cost' || sort_str === 'quantity' || sort_str === 'inventory' || sort_str === 'deposit');
    
    $scope.inv_items.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if ($scope.double_sort > 0) {
        if (keyA === null) {
          return -1;
        } else if (keyB === null) {
          return 1;
        }
        if (isNum)
        {
          return parseFloat(keyA) - parseFloat(keyB);
        } else {
          return -keyA.localeCompare(keyB);
        }
      }
      if (keyA === null) {
        return 1;
      } else if (keyB === null) {
        return -1;
      }
      if (isNum)
      {
        return parseFloat(keyB) - parseFloat(keyA);
      } else {
        return keyA.localeCompare(keyB);
      }
    });
  };
});
*/