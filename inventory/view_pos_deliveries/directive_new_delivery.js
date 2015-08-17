angular.module('myApp')

.directive('newDelivery', function($modal, $http, MathService, DateService) {
  return {
    restrict: 'AE',
    scope: {
      allDistributors: '=',   // for typeahead lookup
      editBeverage: '=',   // if we're using this to edit instead of create new beverage
      volumeUnits: '=',
      closeOnSave: '&',
      closeOnCancel: '&',
      closeOnDelete: '&',
      control: '='
    },
    templateUrl: './view_pos_deliveries/template_new_delivery.html',
    link: function(scope, elem, attrs) {

      scope.internalControl = scope.control || {};

      // When filtering all distributor bevs, push all_bevs into dist_bevs
      // which match the distributor, then splice any unadded and added bevs
      // which are not of distributor.  Do this whenever distributor changes.
      scope.add_inv_all_bevs = [];      // a cache from server of all inv items
      scope.add_inv_dist_bevs = []; // all items filtered with only selected distributor
      scope.add_inv_unadded_bevs = [];  // all_items minus existing items in location
      scope.add_inv_added_bevs = [];
      scope.addInvControl = {};

      scope.add_grand_total = 0;

      scope.delivery_date = null;
      scope.delivery_time = null;
      scope.dt_control = {};

      scope.new_distributor = null;

      scope.show_add_bev_ui = false;

      scope.new_failure_msg = null;

      scope.internalControl.clearNewForm = function() {
        scope.add_grand_total = 0;

        scope.new_distributor = null;
        
        scope.dt_control.resetTime();

        scope.show_add_bev_ui = false;
        scope.new_failure_msg = null;

        scope.add_inv_added_bevs = [];

        scope.applyDistributorFilter();
        scope.clearValidation();
      }

      scope.clearValidation = function() {
        scope.form_ver = {};
        scope.form_ver.error_date = false;
        scope.form_ver.error_time = false;
        scope.form_ver.errors_qty = [];
        for (var i in scope.add_inv_added_bevs) {
          scope.form_ver.errors_qty.push(false);
        }
        scope.new_failure_msg = null;
      };
      scope.clearValidation();

      scope.control.resetTime = function() {
        scope.dt_control.resetTime();
      }

      scope.saveDelivery = function() {

        scope.clearValidation();

        var all_clear = true;

        // first do form validation
        if (scope.delivery_date===undefined || scope.delivery_date===null) {
          all_clear = false;
          scope.form_ver.error_date = true;
        }

        if (scope.delivery_time===undefined || scope.delivery_time===null) {
          all_clear = false;
          scope.form_ver.error_time = true;
        }

        // for each of the added bevs, if their qty is empty, NaN, negative,
        // or 0, throw an error
        for (var i in scope.add_inv_added_bevs) {
          var item = scope.add_inv_added_bevs[i];
          if (item.quantity===undefined || item.quantity===null || item.quantity===0 || MathService.numIsInvalid(item.quantity)) {
            scope.form_ver.errors_qty[i] = true;
            all_clear = false;
            continue;
          } else if (item.inventory===undefined || item.inventory===null || MathService.numIsInvalid(item.inventory)) {
            scope.form_ver.errors_qty[i] = true;
            all_clear = false;
            continue;
          }
        }

        if (!all_clear) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
          return;
        }

        var post_items = [];
        for (var i in scope.add_inv_added_bevs) {
          var item = scope.add_inv_added_bevs[i];
          var post_item = {
            beverage_id: item['id'],
            product: item['product'],
            quantity: parseFloat(item['quantity']),
            value: parseFloat(item['inventory'])
          };
          post_items.push(post_item);
        }

        // by posting local time to server, server will automatically save
        // as utc time in DB
        var delivery_date_local = new Date(
          scope.delivery_date.getFullYear(),
          scope.delivery_date.getMonth(),
          scope.delivery_date.getDate(),
          scope.delivery_time.getHours(),
          scope.delivery_time.getMinutes(),
          0
          );

        var dist_id=null;
        var dist_name=null;
        if (scope.new_distributor!==undefined && scope.new_distributor!==null) {
          dist_id = scope.new_distributor.id;
          dist_name = scope.new_distributor.name;
        }

        var new_delivery = {
          delivery_time: delivery_date_local,
          distributor_id: dist_id,
          distributor: dist_name,
          delivery_items: post_items
        }
        $http.post('/deliveries', 
          new_delivery
          ).
        success(function(data, status, headers, config) {
          console.log(data);
          swal({
            title: "Delivery Saved!",
            text: "Your Delivery is now in your records.",
            type: "success",
            timer: 3000,
            allowOutsideClick: true,
            html: true});

          new_delivery.id = data.id;

          scope.internalControl.clearNewForm();

          // XXX push the delivery into local list of deliveries
          if (scope.closeOnSave !== null) {
            scope.closeOnSave( {new_delivery:new_delivery} );
          }

        }).
        error(function(data, status, headers, config) {

        });

      };

      // get all inventory from the server.  If location type is bev, get /inv
      // items.  If location type is kegs, get /kegs.
      scope.getAllInv = function() {

        $http.get('/inv').
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          if (data != null) {
            scope.add_inv_all_bevs = data;
            for (var i in scope.add_inv_all_bevs) {
              var inv = scope.add_inv_all_bevs[i];
              inv['type'] = 'bev';

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
              inv['unit_cost'] = purchase_cost / purchase_count + deposit;
            }
          }
          else {
            scope.add_inv_all_bevs = [];
          }
          scope.cleanUpExistingInv();
        }).
        error(function(data, status, headers, config) {

        });
      };
      scope.getAllInv();

      scope.cleanUpExistingInv = function() {
        // On the client side, remove any entries in add_inv_unadded_bevs
        // which are already in this location
        var clean_bevs = [];
        for (var i=0; i < scope.add_inv_all_bevs.length; i++) {

          var is_clean = true;
          var test_item = scope.add_inv_all_bevs[i];
          for (var j=0; j < scope.add_inv_added_bevs.length; j++) {
            var check_item = scope.add_inv_added_bevs[j];
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
        scope.add_inv_unadded_bevs = clean_bevs;
      };

      scope.addInvAddBev = function(bev) {

        bev['inventory'] = 0;
        bev['quantity'] = 0;

        scope.add_inv_added_bevs.push(bev);

        // XXX remove added item from scope.add_inv_unadded_bevs manually
        for ( var i=scope.add_inv_unadded_bevs.length-1; i >= 0; i--) {
          if ( scope.add_inv_unadded_bevs[i].id === bev.id) {
            scope.add_inv_unadded_bevs.splice(i, 1);
            break;
          }
        };

        scope.addInvControl.addNewBevSuccess(bev);
      };

      scope.addQuantity = function(inv, num) {

        if (isNaN(num) || num === null) {
          return;
        }

        var cur_quantity = parseFloat(inv.quantity);
        var add_num = parseFloat(num);

        inv.quantity = cur_quantity + add_num;

        if (inv.quantity < 0) {
          inv.quantity = 0;
        }

        if (inv.inventory !== null) {
          inv.inventory = inv.quantity * inv.unit_cost;
        }

        scope.refreshAddGrandTotal();
      };

      scope.addInvQtyChanged = function(inv) {
        var new_qty = parseFloat(inv['quantity']);

        console.log(new_qty);
        if (MathService.numIsInvalid(new_qty) || new_qty === null) {
          return;
        }

        inv.inventory = new_qty * inv.unit_cost;

        scope.refreshAddGrandTotal();
      };

      scope.refreshAddGrandTotal = function() {
        scope.add_grand_total = 0;
        for (var i in scope.add_inv_added_bevs) {
          var item = scope.add_inv_added_bevs[i];
          if (item['inventory']!==undefined && item['inventory']!==null)
          scope.add_grand_total += item.inventory;
        }
      }

      scope.commitRemoveInvItem = function(item) {
        for ( var i=scope.add_inv_added_bevs.length-1; i >= 0; i--) {
          if ( scope.add_inv_added_bevs[i].id === item.id) {
            scope.add_inv_added_bevs.splice(i, 1);
            console.log("spliced item");
            console.log(item);
            break;
          }
        };

        // push removed item back into unadded items
        item['quantity'] = 0;
        item['inventory'] = 0;
        scope.applyDistributorFilter();

        setInterval(
          function() {
            scope.$apply();
            scope.addInvControl.reSort();
          }, 0);

        scope.refreshAddGrandTotal();
      };

      scope.removeInvItem = function(index) {
        console.log(index);
        var item = scope.add_inv_added_bevs[index];
        var item_name = item.product;

        if (item.quantity === 0) {
          scope.commitRemoveInvItem(item);
          return;
        }

        swal({
          title: "Remove Item?",
          text: "This will remove <b>" + item_name + "</b> from this Delivery.  Are you sure?",
          type: "warning",
          html: true,
          showCancelButton: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, remove it!",
          closeOnConfirm: true },
          function() {
            scope.commitRemoveInvItem(item);
          });
      };

      scope.applyDistributorFilter = function() {
        var cid = "cb_dist_bevs_only";
        var doApply = document.getElementById(cid).checked;

        if (scope.new_distributor === null || !doApply) {
          scope.add_inv_dist_bevs = scope.add_inv_all_bevs;
          console.log(scope.add_inv_dist_bevs);
        } else {
          // When filtering all distributor bevs, push all_bevs into dist_bevs
          // which match the distributor, then remove any unadded and added bevs
          // which are not of distributor.  Do this whenever distributor changes.
          scope.add_inv_dist_bevs = [];
          for (var i in scope.add_inv_all_bevs) {
            var item = scope.add_inv_all_bevs[i];
            if (item.distributor_id !== null && item.distributor_id === scope.new_distributor.id) {
              scope.add_inv_dist_bevs.push(item);
            }
          }
          // remove any already added bevs which don't match distributor
          var new_added_bevs = [];
          for (var i in scope.add_inv_added_bevs) {
            var item = scope.add_inv_added_bevs[i];
            if (item.distributor_id !== null && item.distributor_id === scope.new_distributor.id) {
              new_added_bevs.push(item);
            }
          }
          scope.add_inv_added_bevs = new_added_bevs;
        }
        
        // unadded bevs is add_inv_dist_bevs minus add_inv_added_bevs
        var new_unadded_bevs = [];
        for (var i in scope.add_inv_dist_bevs) {
          var item = scope.add_inv_dist_bevs[i];
          var is_unadded = true;
          for (var j in scope.add_inv_added_bevs) {
            var added_item = scope.add_inv_added_bevs[j];
            if (item.id === added_item.id) {
              is_unadded = false;
              break;
            }
          }
          if (is_unadded) {
            new_unadded_bevs.push(item);
          }
        }
        scope.add_inv_unadded_bevs = new_unadded_bevs;
      }

      scope.selectDistributor = function(dist) {

        scope.clearValidation();

        console.log("Selected dist " + dist);
        
        // if coming from no distributor, default the "show only bevs from this
        // distributor" option.  Otherwise, preserve user's previous selection
        if (scope.new_distributor === null) {
          var cid = "cb_dist_bevs_only";
          document.getElementById(cid).checked = true;
        }

        scope.new_distributor = dist;

        scope.applyDistributorFilter();

      };

      scope.toggleDistBevsOnly = function() {
        scope.applyDistributorFilter();
      };

      scope.clearDistributor = function() {
        scope.new_distributor = null;
      };

      scope.showAddBevInv = function() {
        scope.show_add_bev_ui = true;
      };

      scope.hideAddBevInv = function() {
        scope.show_add_bev_ui = false;
      };

    }
  }
});