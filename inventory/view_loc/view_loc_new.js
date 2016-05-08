'use strict';

angular.module('myApp.viewInvByLocNew', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewInvByLocNew', {
      templateUrl: 'view_loc/view_loc_new.html',
      controller: 'ViewInvByLocNewCtrl',
      resolve: {
        locType: function() {
          // location type can be "bev" for beverage storage locations
          // or "kegs" for empty kegs storage locations
          return "bev";
        }
      }
    });
}])

.controller('ViewInvByLocNewCtrl', function($scope, $modal, $http, DateService, MathService, ItemsService, locType) {

  // XXX DO NOT REASSIGN VALUE OF k_loc_type, it is determined by route
  // to be "bev" or "keg" and is a CONSTANT
  $scope.k_loc_type = locType;

  $scope.show_add_loc_ui = false;  // add new location mode
  $scope.newLocControl = {};
  $scope.edit_loc = false;      // edit location mode
  $scope.editLocControl = {};

  $scope.locations = [];        // all locations
  $scope.selected_loc = null;   // selected location
  $scope.last_update = null;    // last update text
  $scope.add_inv_all_bevs = [];  // a cache from server of all inv items
  $scope.add_inv_existing_bevs = [];  // all_items minus existing items in location
  $scope.all_kegs = [];
  $scope.add_inv_existing_kegs = [];
  $scope.total_inventory = 0;
  $scope.inv_items = [];
  $scope.inv_started = false;
  $scope.update_failure_msg = "";

  // querying / filtering
  $scope.add_inv_query = {query:""};

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;

  // ===========================================================================
  // Locations, these are shared functionality between bev and keg views
  // ===========================================================================
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
    $scope.show_add_loc_ui=true;
  };

  $scope.hideAddLoc = function() {
    $scope.show_add_loc_ui=false;
    $scope.newLocControl.clearNewForm();
  };

  $scope.newLocationCloseOnSave = function(new_loc) {
    // new_loc is the name of the new location
    var new_loc_obj = {name:new_loc, last_update:null, last_update_pretty:null};
    $scope.locations.push(new_loc_obj);
    $scope.selectLoc(new_loc_obj);
    $scope.show_add_loc_ui = false;
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

  $scope.toggleEditLoc = function() {
    if ($scope.edit_loc) {
      $scope.edit_loc = false;
      $scope.editLocControl.clearForm();
    } else {
      $scope.edit_loc=true;
    }
  };


  // ===========================================================================
  // Inventory-related, these differ for 'bev' or 'kegs' k_loc_type
  // ===========================================================================
  $scope.clearLocState = function() {
    $scope.last_update = null;
    $scope.show_add_loc_ui = false;   // add new location mode
    $scope.edit_loc = false;      // edit location mode
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
    $scope.getLocInv();
    $scope.last_update = loc.last_update_pretty;
    $scope.show_add_loc_ui = false;   // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  // get all inventory from the server.  If location type is bev, get /inv
  // items.  If location type is kegs, get /kegs.
  $scope.getAllInv = function() {

    $http.get('/inv').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.add_inv_all_bevs = data;
        ItemsService.processBevsForAddable($scope.add_inv_all_bevs);

      }
      else {
        $scope.add_inv_all_bevs = [];
      }

      // now that we got beverage inventory, get the empty kegs as well
      $scope.getAllKegs();
      
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getAllInv();

  $scope.getAllKegs = function() {
    $http.get('/kegs').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.all_kegs = data;
        ItemsService.processKegsForAddable($scope.all_kegs);
      }
      else {
        $scope.all_kegs = [];
      }

      $scope.cleanUpExistingInv();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.cleanUpExistingInv = function() {
    // On the client side, remove any entries in add_inv_existing_bevs
    // which are already in this location
    var clean_bevs = [];
    for (var i=0; i < $scope.add_inv_all_bevs.length; i++) {

      var is_clean = true;
      var test_item = $scope.add_inv_all_bevs[i];
      for (var j=0; j < $scope.inv_items.length; j++) {
        var check_item = $scope.inv_items[j];
        if (check_item['type'] === "keg") {
          continue;
        }
        if (test_item['version_id'] == check_item['version_id'])
        {
          is_clean = false;
          break;
        }
      }
      if (is_clean) {
        clean_bevs.push(test_item);
      }
    }
    $scope.add_inv_existing_bevs = clean_bevs;

    // now clean kegs
    var clean_kegs = [];
    for (var i=0; i < $scope.all_kegs.length; i++) {
      var is_clean = true;
      var test_item = $scope.all_kegs[i];
      for (var j=0; j < $scope.inv_items.length; j++) {
        var check_item = $scope.inv_items[j];
        if (check_item['type'] === "bev") {
          continue;
        }
        if (test_item['version_id'] == check_item['version_id'])
        {
          is_clean = false;
          break;
        }
      }
      if (is_clean) {
        clean_kegs.push(test_item);
      }
    }
    $scope.add_inv_existing_kegs = clean_kegs;
  };

  $scope.addInvAddBev = function(bev) {
    $http.post('/inv/loc', {
      id:bev.id, 
      location: $scope.selected_loc.name,
      type:'bev'
    }).
    success(function(data, status, headers, config) {

      console.log(data);

      var bev_clone = JSON.parse( JSON.stringify( bev ) );

      bev_clone['quantity'] = 0;
      bev_clone['inventory'] = 0;

      if (data !== null && typeof data === 'object') {
        if ('quantity' in data) {
          bev_clone.quantity = data['quantity'];
        }
        if ('inventory' in data) {
          bev_clone.inventory = data['inventory'];
          $scope.total_inventory += data['inventory'];
        }
        if ('out_of_date' in data) {
          bev_clone.out_of_date = data['out_of_date']
        }
      }

      $scope.inv_items.push(bev_clone);

      // XXX remove added item from $scope.add_inv_existing_bevs manually
      for ( var i=$scope.add_inv_existing_bevs.length-1; i >= 0; i--) {
        if ( $scope.add_inv_existing_bevs[i].id === bev_clone.id) {
          $scope.add_inv_existing_bevs.splice(i, 1);
          break;
        }
      }

      $scope.sortBy($scope.sort_key);
      $scope.sortBy($scope.sort_key);
    }).
    error(function(data, status, headers, config) {
    });
  };

  $scope.addInvAddKeg = function(keg) {
    console.log(keg);
    $http.post('/inv/loc', {
      id:keg.id, 
      location: $scope.selected_loc.name,
      type:'keg'
    }).
    success(function(data, status, headers, config) {

      console.log(data);

      var keg_clone = JSON.parse( JSON.stringify( keg ) );

      // XXX push new keg onto location's inventory items
      // XXX if new keg not in all inventory, push into
      keg_clone['quantity'] = 0;
      keg_clone['inventory'] = 0;

      if (data !== null && typeof data === 'object') {
        if ('quantity' in data) {
          keg_clone.quantity = data['quantity'];
        }
        if ('inventory' in data) {
          keg_clone.inventory = data['inventory'];
          $scope.total_inventory += data['inventory'];
        }
        if ('out_of_date' in data) {
          keg_clone.out_of_date = data['out_of_date']
        }
      }

      $scope.inv_items.push(keg_clone);
      // XXX remove added item from $scope.all_kegs manually
      for ( var i=$scope.add_inv_existing_kegs.length-1; i >= 0; i--) {
        if ( $scope.add_inv_existing_kegs[i].id === keg_clone.id) {
          $scope.add_inv_existing_kegs.splice(i, 1);
          break;
        }
      }
     
      $scope.sortBy($scope.sort_key);
      $scope.sortBy($scope.sort_key);
    }).
    error(function(data, status, headers, config) {
    });
  };

  $scope.removeInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];
    var item_name = item.product;
    if (item.type==='keg') {
      item_name = "Keg Deposit - " + item.distributor + " " + MathService.fixFloat1(item.purchase_volume) + " " + item.purchase_unit;
    }
    swal({
      title: "Remove Item?",
      text: "This will remove <b>" + item_name + "</b> from " + $scope.selected_loc.name + ".<br/><br/>It will not affect other locations which carry the item, or its entry in the Beverage DB.",
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
            type:item.type
          }
        }).
        success(function(data, status, headers, config) {
          $scope.getLocInv();
          swal("Removed!", item.name + " has been removed.", "success");

          // push item back into add_inv_existing_bevs
          item['inventory'] = 0;
          item['quantity'] = 0;
          if (item.type==='bev') {
            $scope.add_inv_existing_bevs.push(item);
          } else {
            $scope.add_inv_existing_kegs.push(item);
          }
          
          $scope.sortBy($scope.sort_key);
          $scope.sortBy($scope.sort_key);
        }).
        error(function(data, status, headers, config) {

        });
      });
    
  };

  $scope.promptCountSheets = function() {
    var modalStartInstance = $modal.open({
      templateUrl: 'printCountSheetsModal.html',
      controller: 'printCountSheetsModalCtrl',
      windowClass: 'start-count-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'md',
      resolve: {
        locations: function() {
          return $scope.locations;
        }
      }
    });

    modalStartInstance.result.then(
      // success status
      function( result ) {
        var res = result[0];

        $scope.previewCountSheets();
      }, 
      // error status
      function() {
        ;
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
      templateUrl: 'startCountModalNew.html',
      controller: 'startCountModalNewCtrl',
      windowClass: 'start-count-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'md',
      resolve: {
        
      }
    });

    modalStartInstance.result.then(
      // success status
      function( result ) {
        var mode = result[0];
        var count = result[1];

        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        if (mode === 'scratch') {
          $scope.startInv(true, null);
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (mode === 'previous') {
          if (count === 'scratch') {
            $scope.startInv(false, true);
          } else {
            $scope.startInv(false, false);
          }
        }
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.startInv = function(from_scratch, from_zero) {
    //$scope.inv_started = true;

    var existing_items = [];
    if (!from_scratch) {
      existing_items = JSON.parse(JSON.stringify($scope.inv_items));
      if (from_zero) {
        for (var i in existing_items) {
          var item = existing_items[i];
          item['quantity'] = 0;
        }
      }
    }

    console.log('existing')
    console.log(existing_items);

    var modalStartInstance = $modal.open({
      templateUrl: 'startInvModal.html',
      controller: 'startInvModalCtrl',
      windowClass: 'start-inv-modal',
      backdropClass: 'green-modal-backdrop',
      size: 'lg',
      backdrop : 'static',
      keyboard: false,
      resolve: {
        all_bevs: function() {
          return $scope.add_inv_all_bevs;
        },
        all_kegs: function() {
          return $scope.all_kegs;
        },
        loc_name: function() {
          return $scope.selected_loc.name;
        },
        existing_items: function() {
          return existing_items;
        }
      }
    });

    modalStartInstance.result.then(
      // success status
      function( result ) {
        var status = result[0];
        var data = result[1];
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        if (status === 'cancel') {
          ;
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (status === 'save') {
          
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
          $scope.getLocInv();
        }
      }, 
      // error status
      function() {
        ;
      });


    /*
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
    */
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
      post_item_quantities.push({id:inv.id, quantity:parseFloat(inv.quantity), type:inv.type})
      $scope.inv_items[inv_i]['invalid_quantity'] = false;
      $scope.inv_items[inv_i]['add_q'] = null;

      // We locally calculate the new inventory without polling the server
      var value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];

      // always include deposits in value
      if (inv['deposit'] !== null) {
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
      if (inv.type==='bev') {
        inv['unit_cost'] = purchase_cost / purchase_count + deposit;
      } else if (inv.type==='keg') {
        inv['unit_cost'] = deposit;
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
  };

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

    inv.quantity = MathService.fixFloat2(inv.quantity);

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
          // inaccurate calculations here.
          value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];
          // always include deposits in value
          if (inv['deposit'] !== null) {
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
        if (inv['volume'] !== undefined && inv['volume']!==null) {
          inv.volume = MathService.fixFloat1(inv.volume);
        }
        if (inv['purchase_volume'] !== undefined && inv['purchase_volume']!==null) {
          inv.purchase_volume = MathService.fixFloat1(inv.purchase_volume);
        }
        
        if ($scope.inv_items[inv_i]['type']==='bev') {
          $scope.inv_items[inv_i]['unit_cost'] = purchase_cost / purchase_count + deposit;
        } else { // keg
          $scope.inv_items[inv_i]['unit_cost'] = deposit;
        }

        if (inv.type==='keg') {
          inv['container_type'] = 'Empty Keg';

          // keg displays use 'volume' and 'unit', while the GET result
          // lists these as 'purchase_*'
          inv['volume'] = inv['purchase_volume'];
          inv['unit'] = inv['purchase_unit'];
        }

        // get icon
        inv['icon'] = ItemsService.getItemIcon(inv);
        inv['display_name'] = ItemsService.getDisplayName(inv);
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

      console.log($scope.inv_items);

      if ($scope.firstTimeSort) {
        $scope.firstTimeSort = false;
        $scope.sortBy('product');
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.sortFunc = function(a, b) {
    var sort_str = $scope.sort_key;
    var isNum = (sort_str === 'unit_cost' || sort_str === 'quantity' || sort_str === 'inventory' || sort_str === 'deposit');
    if (a['type']==='keg' && (sort_str==='product' || sort_str==='brewery')) {
      sort_str = 'distributor';
    }

    var keyA = a[sort_str];
    var keyB = b[sort_str];
    if ($scope.double_sort > 0) {
      if (keyA===null || keyA===undefined) {
        return -1;
      } else if (keyB===null || keyB===undefined) {
        return 1;
      }
      if (isNum)
      {
        return parseFloat(keyA) - parseFloat(keyB);
      } else {
        return -keyA.localeCompare(keyB);
      }
    }
    if (keyA===null || keyA===undefined) {
      return 1;
    } else if (keyB===null || keyB===undefined) {
      return -1;
    }
    if (isNum)
    {
      return parseFloat(keyB) - parseFloat(keyA);
    } else {
      return keyA.localeCompare(keyB);
    }
  };

  $scope.sortBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key;
    if (double_sort) {
      $scope.double_sort *= -1;
    } else {
      $scope.double_sort = -1;
    }
    $scope.sort_key = sort_str;

    var bev_items = [];
    var keg_items = [];

    for (var i in $scope.inv_items) {
      var item = $scope.inv_items[i];
      if (item.type==='bev'){
        bev_items.push(item);
      } else {
        keg_items.push(item);
      }
    }

    bev_items.sort($scope.sortFunc);
    keg_items.sort($scope.sortFunc);
    $scope.inv_items = bev_items.concat(keg_items);
    
    //$scope.inv_items.sort($scope.sortFunc);
  };
})

.controller('printCountSheetsPDFModalCtrl', function($scope, $modalInstance, $http, $filter, $sce, ItemsService, content_type, review_obj) {

  $scope.trustAsHtml = $sce.trustAsHtml;

  $scope.content_type = content_type;
  $scope.review_obj = review_obj;

  // alert Safari users that their browser is bad
  $scope.userAgent = null;
  var uagent = navigator.userAgent.toLowerCase(); 
  if (uagent.indexOf('safari') != -1) { 
    if (uagent.indexOf('chrome') > -1) {
      $scope.userAgent = 'chrome';
    } else {
      $scope.userAgent = 'safari';
    }
  }
  console.log($scope.userAgent);

  $scope.loadPdf = function() {

    var pdf_url = $scope.review_obj;
    var iframe = document.getElementById("pdf_embed");
    iframe.setAttribute("src", pdf_url);
  };
  
  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

  $scope.doPrint = function() {
    
  };

})

.controller('printCountSheetsModalCtrl', function($scope, $modalInstance, $http, $modal, locations) {

  $scope.locations = locations;
  $scope.inv_locations = []; // stores only locations with previous inventory counts
  $scope.none_checked = true;

  for (var i in $scope.locations) {
    var loc = $scope.locations[i];
    if (loc.last_bev_count > 0 || loc.last_keg_count > 0) {
      loc['print_sheet'] = true;
      $scope.inv_locations.push(loc);
      $scope.none_checked = false;
    }
  }

  $scope.show_help = false;

  $scope.showHelp = function() {
    $scope.show_help = true;
  };

  $scope.checkedCountSheetLocation = function(loc) {
    loc['print_sheet'] = !loc['print_sheet'];

    $scope.none_checked = true;
    for (var i in $scope.inv_locations) {
      var loc = $scope.inv_locations[i];
      if (loc['print_sheet'] == true) {
        $scope.none_checked = false;
        break;
      }
    }
  };

  $scope.confirm = function() {

    var print_loc_ids = [];
    for (var i in $scope.inv_locations) {
      var loc = $scope.inv_locations[i];
      if (loc['print_sheet'] == true) {
        print_loc_ids.push(loc['id']);
      }
    }

    console.log(print_loc_ids)
    var params = { 
      loc_ids: print_loc_ids.toString()
    };

    $http.get('/inv/countsheets', 
      {params: params })
    .success(function(data, status, headers, config) {
      console.log(data);

      var modalEditInstance = $modal.open({
        templateUrl: 'printCountSheetsPDFModal.html',
        controller: 'printCountSheetsPDFModalCtrl',
        windowClass: 'review-purch-modal',
        backdropClass: 'white-modal-backdrop',
        resolve: {
          content_type: function() {
            return "pdf";
          },
          review_obj: function() {
            var URL = data['url'];
            return URL;
          }
        }
      });

      modalEditInstance.result.then(
        // success status
        function( result ) {
          // result is a list, first item is string for status, e.g.,
          // 'save' or 'delete'
          // second item is the affected beverage
          var status = result[0];

        }, 
        // error status
        function() {

        });

    })
    .error(function(data, status, headers, config) {

    });
  }

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };
})

.controller('startCountModalNewCtrl', function($scope, $modalInstance) {

  $scope.show_help = false;
  $scope.is_previous = false;

  $scope.showHelp = function() {
    $scope.show_help = true;
  }

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

  $scope.pickStartItems = function(mode) {
    // mode should be 'scratch' or 'previous'
    if (mode==='previous') {
      $scope.is_previous=true;
    } else {
      $modalInstance.close(['scratch', null]);
    }
  };

  $scope.pickMode = function(mode) {
    // mode should be 'scratch' or 'previous'

    $modalInstance.close(['previous', mode]);

  }

})

.controller('startInvModalCtrl', function($scope, $modalInstance, $modal, $http, DateService, loc_name, all_bevs, all_kegs, existing_items) {

  $scope.loc_name = loc_name;

  // these will be passed to directives for manipulation and display
  $scope.all_bevs = all_bevs;
  $scope.all_kegs = all_kegs;
  $scope.added_items = existing_items;

  // for calling into the addable directive
  $scope.addableControl = {};

  // removeItem passes the item removed by added-items directive to
  // addable-items directive so it reappears on the addable list
  $scope.removeItem = function( item ) {
    $scope.addableControl.addItemToList( item );
  };

  $scope.saveInv = function() {

    var hasNaNs = false;
    // first check that all update quantities are valid numbers
    for (var i in $scope.added_items) {
      var inv = $scope.added_items[i];
      if (isNaN(inv.quantity) || inv.quantity < 0) {
        $scope.added_items[i]['invalid_quantity'] = true;
        hasNaNs = true;
      }
      else {
        $scope.added_items[i]['invalid_quantity'] = false;
      }
    }
    if (hasNaNs) {
      //$scope.update_failure_msg = "Please fix invalid quantities highlighted in red and try again!";
      return;
    }

    //$scope.update_failure_msg = "";

    // inv_started shows the quantity adjustment UI

    $scope.total_inventory = 0;
    var post_item_quantities = []
    for (var i in $scope.added_items) {
      var inv = $scope.added_items[i];
      console.log(inv.product);
      console.log(inv.quantity);
      post_item_quantities.push({id:inv.id, quantity:parseFloat(inv.quantity), type:inv.type})
      $scope.added_items[i]['invalid_quantity'] = false;
      $scope.added_items[i]['add_q'] = null;

      // We locally calculate the new inventory without polling the server
      var value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];

      // always include deposits in value
      if (inv['deposit'] !== null) {
        value += inv['deposit'] * inv['quantity'];
      }
      $scope.added_items[i]['inventory'] = value;
      $scope.added_items[i]['out_of_date'] = null;
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
      if (inv.type==='bev') {
        inv['unit_cost'] = purchase_cost / purchase_count + deposit;
      } else if (inv.type==='keg') {
        inv['unit_cost'] = deposit;
      }
    };

    $http.put('/inv/loc', {
      items:post_item_quantities,
      location:$scope.loc_name,
      type:"bev"
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

      // return data to calling controller
      var return_data = {};
      // server redundantly returns total inventory, set it just in case
      return_data['total_inventory'] = data['total_inventory'];
      return_data['last_update'] = data['last_update'];

      $modalInstance.close(['save', return_data]);
    }).
    error(function(data, status, headers, config) {

    });
  }

  $scope.cancelInv = function() {
    $modalInstance.dismiss(['cancel', null]);
  };
})

.controller('modalInvQuantityCtrl', function($scope, $modalInstance, $modal, item, is_edit, is_delivery, MathService) {

  $scope.item = item;
  $scope.is_edit = is_edit;
  if (is_edit) {
    $scope.quantity = item.quantity;
  } else {
    $scope.quantity = 0;
  }

  $scope.expected_invoice = {value:0}

  $scope.new_failure_msg = null;

  $scope.is_delivery = is_delivery;

  $scope.addQuantity = function(inv, num, isAddQ) {

    if (isNaN(num) || num === null) {
      if (isAddQ) {
        inv.add_q = null;
      }
      return;
    }

    var cur_quantity = parseFloat($scope.quantity);
    var add_num = parseFloat(num);

    $scope.quantity = cur_quantity + add_num;

    if ($scope.quantity < 0) {
      $scope.quantity = 0;
    }

    $scope.quantity = MathService.fixFloat2($scope.quantity);

    if (isAddQ) {
      inv.add_q = null;
    }

    $scope.updateExpectedInvoice();
  };

  $scope.updateExpectedInvoice = function() {
    if ($scope.is_delivery !== true) {
      return;
    }

    if (MathService.numIsInvalidOrNegative($scope.quantity)) {
      return;
    }

    $scope.expected_invoice.value = $scope.item['purchase_cost'] * $scope.quantity;

  }
  $scope.updateExpectedInvoice();

  $scope.save = function() {

    $scope.new_failure_msg = null;

    // first do error check
    if (isNaN($scope.quantity) || $scope.quantity < 0) {
      $scope.new_failure_msg = "Please enter a valid quantity!";
      return;
    }

    // here's a special case: if type is keg deposit and quantity is not a whole
    // number, need to error
    if ($scope.item.type==='keg' && !MathService.isInt($scope.quantity)) {
      $scope.new_failure_msg = "Keg counts must be whole numbers!";
      return;
    }

    $scope.item.quantity = $scope.quantity;

    // if the item has a 'value' field, it should be purchase_cost * quantity
    // e.g., for deliveries
    if ($scope.item['value'] !== undefined) {
     $scope.item['value'] = $scope.item['purchase_cost'] * $scope.item['quantity'];
    }

    if ($scope.is_edit) {
      $modalInstance.close(['edit', null]);
    } else {
      $modalInstance.close(['save', $scope.item]);
    }
    
  };

  $scope.editBev = function( item ) {
    // When user edits beverage unit pricing
    // launch modal for editing unit price

    // XXX This is necessary here!  Other views (such as the delivery view,
    // which calls modal inv quantity, calls into here)
    // Dan's note on 10/10/2015

    console.log(item);

    var modalEditInstance = $modal.open({
      templateUrl: 'editInvModal.html',
      controller: 'editInvModalCtrl',
      windowClass: 'edit-purchase-modal',
      backdropClass: 'green-modal-backdrop',
      resolve: {
        edit_beverage: function() {
          return item;
        },
        all_distributors: function() {
          return [];
        },
        all_breweries: function() {
          // we're invoking the modal in edit purchase info only, so don't
          // need to provide breweries
          return [];
        },
        volume_units: function() {
          return [];
        },
        edit_mode: function() {
          return "purchase";
        },
        hide_delete: function() {
          return true;
        },
        required_vars: function() {
          return [];
        }
      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        $scope.updateExpectedInvoice();
      }, 
      // error status
      function() {
        ;
      });

  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

});
