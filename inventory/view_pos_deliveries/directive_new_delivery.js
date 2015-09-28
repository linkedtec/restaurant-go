angular.module('myApp')

.directive('newDelivery', function($modal, $http, $timeout, MathService, DateService, DeliveriesService) {
  return {
    restrict: 'AE',
    scope: {
      allDistributors: '=',   // for typeahead lookup
      editDelivery: '=',   // if we're using this to edit instead of create new beverage
      volumeUnits: '=',
      closeOnSave: '&',
      closeOnCancel: '&',
      closeOnDelete: '&',
      control: '='
    },
    templateUrl: './view_pos_deliveries/template_new_delivery.html',
    link: function(scope, elem, attrs) {

      scope.internalControl = scope.control || {};
      scope.is_edit = false;

      // When filtering all distributor bevs, push all_bevs into dist_bevs
      // which match the distributor, then splice any unadded and added bevs
      // which are not of distributor.  Do this whenever distributor changes.
      scope.add_inv_all_bevs = [];      // a cache from server of all inv items
      scope.add_inv_dist_bevs = []; // all items filtered with only selected distributor
      scope.add_inv_unadded_bevs = [];  // all_items minus existing items in delivery
      scope.addInvControl = {};

      scope.add_grand_total = 0;

      scope.dist_checked = false;

      scope.dt_control = {};

      scope.show_add_bev_ui = false;

      scope.new_failure_msg = null;
      scope.save_warning = false;

      // a new delivery is just the following:
      // a delivery_date
      // a delivery_time
      // an optional distributor
      // A list of bevs / quantity / value, add_inv_added_bevs
      //    delivery_items
      scope.init = function() {
        if (scope.editDelivery!==undefined && scope.editDelivery!==null) {
          console.log('edit');
          scope.is_edit=true;

          scope.new_delivery = JSON.parse( JSON.stringify( scope.editDelivery ) );
          
          // stringify will change delivery_date object into string, need to 
          // convert it back
          scope.new_delivery['delivery_date'] = DateService.getDateFromUTCTimeStamp(
            scope.new_delivery['delivery_date'], true);
          scope.new_delivery['delivery_time'] = new Date(scope.new_delivery['delivery_time']);

          scope.add_grand_total = scope.new_delivery['inv_sum'];

          console.log(scope.new_delivery);

          // initiate the state of the "Add only from this distributor" checkbox
          // check the distributor_id of the new_delivery.  If all delivery_items'
          if (scope.new_delivery.distributor_obj !== null) {
            var all_bev_dists_match = true;
            for (var i in scope.new_delivery.delivery_items) {
              var item = scope.new_delivery.delivery_items[i];
              if (item.distributor_id !== scope.new_delivery.distributor_id) {
                all_bev_dists_match = false;
                break;
              }
            }
            if (all_bev_dists_match) {
              scope.dist_checked = true;
            }
          }

          scope.save_title = "Save Changes";
        } else {
          scope.new_delivery = {};
          scope.new_delivery['distributor'] = null;     // this is string of distributor name
          scope.new_delivery['distributor_obj'] = null; // this is distributor object
          scope.new_delivery['delivery_date'] = null;
          scope.new_delivery['delivery_time'] = null;
          scope.new_delivery['delivery_items'] = [];
          scope.save_title = "Save New Delivery"
        }
      }
      angular.element(document).ready(function() {
        scope.init();
      });

      // detect when delivery date or delivery time change, check if they are
      // valid edits and we should display save warning
      scope.$watch('new_delivery.delivery_date + new_delivery.delivery_time', function(newVal, oldVal) {
        console.log('delivery date changed');
        scope.checkEditDiffs();
      }, true);

      scope.clearValidation = function() {
        scope.form_ver = {};
        scope.form_ver.error_date = false;
        scope.form_ver.error_time = false;
        scope.form_ver.errors_qty = [];
        if (scope.new_delivery!==undefined && scope.new_delivery!==null) {
          for (var i in scope.new_delivery.delivery_items) {
            scope.form_ver.errors_qty.push(false);
          }
        }
        
        scope.new_failure_msg = null;
      };
      scope.clearValidation();

      scope.internalControl.clearNewForm = function() {
        scope.add_grand_total = 0;

        scope.new_delivery['distributor_obj'] = null;
        
        scope.dt_control.resetTime();

        scope.show_add_bev_ui = false;
        scope.new_failure_msg = null;

        scope.new_delivery.delivery_items = [];

        scope.applyDistributorFilter();
        scope.clearValidation();
      }

      scope.control.resetTime = function() {
        scope.dt_control.resetTime();
      };

      // this is only callable within the editing context, and will tell the
      // controlling edit modal to dismiss itself
      scope.cancel = function() {
        scope.internalControl.cancel();
      };

      scope.saveDelivery = function() {

        scope.clearValidation();

        // first fix data -- potentially have quantity as string, need to 
        // convert to float
        for (var i in scope.new_delivery.delivery_items) {
          var item = scope.new_delivery.delivery_items[i];
          item['quantity'] = MathService.fixFloat2(parseFloat(item['quantity']));
          item['value'] = MathService.fixFloat2(parseFloat(item['value']));
        }

        scope.new_delivery['inv_sum'] = scope.add_grand_total;

        var all_clear = true;

        // first do form validation
        if (scope.new_delivery.delivery_date===undefined || scope.new_delivery.delivery_date===null) {
          all_clear = false;
          scope.form_ver.error_date = true;
        }

        if (scope.new_delivery.delivery_time===undefined || scope.new_delivery.delivery_time===null) {
          all_clear = false;
          scope.form_ver.error_time = true;
        }

        // for each of the added bevs, if their qty is empty, NaN, negative,
        // or 0, throw an error
        for (var i in scope.new_delivery.delivery_items) {
          var item = scope.new_delivery.delivery_items[i];
          if (item.quantity===undefined || item.quantity===null || item.quantity===0 || MathService.numIsInvalid(item.quantity)) {
            scope.form_ver.errors_qty[i] = true;
            all_clear = false;
            continue;
          } else if (item.value===undefined || item.value===null || MathService.numIsInvalid(item.value)) {
            scope.form_ver.errors_qty[i] = true;
            all_clear = false;
            continue;
          }
        }

        if (!all_clear) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
          return;
        }

        if (!scope.is_edit) {
          scope.postNewDelivery();
        } else {
          scope.postEditDelivery();
        }

      };

      scope.postEditDelivery = function() {
        // If this is an EDIT operation
        // Find any diffs between the original and the modified object.
        // Instead of doing a comprehensive generic comparison, we rely on
        // knowing the delivery object's structure to do comparisons (e.g.,
        // the fact that size_prices is an array of objects)
        var changedKeys = [];     // store which keys changed
        // handle changed time seperately.  delivery_date or delivery_time on
        // client could have changed, but on server it's just treated as a 
        // single delivery_time, so consolidate if either one changed on client
        var time_changed = false;

        for (var key in scope.new_delivery) {
          if (scope.editDelivery.hasOwnProperty(key)) {
            if (key === '__proto__' || key === '$$hashKey' || key === 'distributor_obj' || key === 'distributor') {
              continue;
            } else if (key==='delivery_date' || key==='delivery_time') {
              var odate = scope.editDelivery[key].getTime();
              var ndate = scope.new_delivery[key].getTime();
              if (odate !== ndate) {
                time_changed = true;
                continue;
              }
            } else if (key==='delivery_items') {
              // handle known special cases such as delivery_items
              var osp = scope.editDelivery.delivery_items;
              var sp = scope.new_delivery.delivery_items;
              if ( (osp===null && sp!==null) || (osp!==null&&sp===null) ) {
                changedKeys.push(key);
                continue;
              }
              if (scope.editDelivery.delivery_items.length !== scope.new_delivery.delivery_items.length)
              {
                changedKeys.push(key);
                continue;
              }
              for (var i in scope.editDelivery.delivery_items) {
                var osp = scope.editDelivery.delivery_items[i]
                var sp = scope.new_delivery.delivery_items[i];
                // note that in new_delivery, item.quantity will be a string,
                // so need to convert it to fixed2 float for comparison
                var oquantity = MathService.fixFloat2(osp.quantity);
                var nquantity = MathService.fixFloat2(parseFloat(sp.quantity));
                if (oquantity != nquantity || osp.value != sp.value) {
                  changedKeys.push(key);
                  continue;
                }
              }
            }
            else if (scope.editDelivery[key] !== scope.new_delivery[key]) {
              changedKeys.push(key);
            }
          }
        }

        if (time_changed) {
          var delivery_date_local = new Date(
            scope.new_delivery.delivery_date.getFullYear(),
            scope.new_delivery.delivery_date.getMonth(),
            scope.new_delivery.delivery_date.getDate(),
            scope.new_delivery.delivery_time.getHours(),
            scope.new_delivery.delivery_time.getMinutes(),
            0
            );
          changedKeys.push('delivery_time');
          scope.new_delivery['delivery_time'] = delivery_date_local;
        }

        if (changedKeys.length === 0) {
          scope.cancel();
          return;
        }

        // now put the values of the *changed* keys to the server
        var putObj = {};
        for (var i in changedKeys) {
          var key = changedKeys[i];
          putObj[key] = scope.new_delivery[key];
        }
        putObj.id = scope.new_delivery.id;

        console.log(changedKeys);
        console.log(putObj);

        var result = DeliveriesService.put(putObj, changedKeys);
        result.then(
        function(payload) {

          if (scope.closeOnSave !== null) {
            // returning an object with key new_distributor allows us to
            // pass the controller the new distributor from this directive!
            scope.closeOnSave( {new_delivery:scope.new_delivery} );
          }

          if (scope.internalControl !== null)
          {
            scope.internalControl.clearNewForm();
          }

        },
        function(errorPayload) {
          ; // do nothing for now
        });
      }

      scope.postNewDelivery = function() {
        var post_items = [];
        for (var i in scope.new_delivery.delivery_items) {
          var item = scope.new_delivery.delivery_items[i];
          var post_item = {
            beverage_id: item['id'],
            product: item['product'],
            quantity: item['quantity'],
            value: item['value']
          };
          post_items.push(post_item);
        }

        // by posting local time to server, server will automatically save
        // as utc time in DB
        var delivery_date_local = new Date(
          scope.new_delivery.delivery_date.getFullYear(),
          scope.new_delivery.delivery_date.getMonth(),
          scope.new_delivery.delivery_date.getDate(),
          scope.new_delivery.delivery_time.getHours(),
          scope.new_delivery.delivery_time.getMinutes(),
          0
          );

        var dist_id=null;
        var dist_name=null;
        if (scope.new_delivery.distributor_obj!==undefined && scope.new_delivery.distributor_obj!==null) {
          dist_id = scope.new_delivery.distributor_obj.id;
          dist_name = scope.new_delivery.distributor_obj.name;
        }

        var new_delivery = {
          delivery_time: delivery_date_local,
          distributor_id: dist_id,
          distributor: dist_name,
          delivery_items: post_items
        }
        var result = DeliveriesService.post(new_delivery);
        result.then(
          function(payload) {
            console.log(payload.data);
            swal({
              title: "Delivery Saved!",
              text: "Your Delivery is now in your records.",
              type: "success",
              timer: 3000,
              allowOutsideClick: true,
              html: true});

            new_delivery.id = payload.data.id;

            scope.internalControl.clearNewForm();

            // XXX push the delivery into local list of deliveries
            if (scope.closeOnSave !== null) {
              scope.closeOnSave( {new_delivery:new_delivery} );
            }

          },
          function(errorPayload) {
            ; // do nothing for now
          });
          
      };

      scope.deleteDelivery = function() {
        var delivery_id = scope.new_delivery.id;

        swal({
          title: "Delete Delivery?",
          text: "This will permanently remove this <b>" + scope.new_delivery.pretty_date + "</b> Delivery from the system, and cannot be undone.",
          type: "warning",
          showCancelButton: true,
          html: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, remove it!",
          closeOnConfirm: false },
          function() {

            var result = DeliveriesService.delete(delivery_id);
            result.then(
              function(payload) {
                
                if (scope.closeOnDelete !== null) {
                  scope.closeOnDelete();
                }

              },
              function(errorPayload) {
                ; // do nothing for now
              });
        });
      };

      scope.getVolUnits = function() {
        $http.get('/volume_units').
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          scope.volume_units_full = data;
          scope.volume_units = [];
          for (var i=0; i < data.length; i++)
          {
            scope.volume_units.push(data[i].abbr_name);
          }
        }).
        error(function(data, status, headers, config) {

        });
      };
      scope.getVolUnits();

      scope.getBevUnitCost = function(inv) {
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

        return purchase_cost / purchase_count + deposit;
      };

      // get all inventory from the server.  If location type is bev, get /inv
      // items.  If location type is kegs, get /kegs.
      scope.getAllInv = function() {

        $http.get('/inv').
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          if (data != null) {
            scope.add_inv_all_bevs = data;
            for (var i in scope.add_inv_all_bevs) {
              var inv = scope.add_inv_all_bevs[i];
              inv['type'] = 'bev';

              // locally calculate unit_cost for sorting purposes
              inv['unit_cost'] = scope.getBevUnitCost(inv);
            }
          }
          else {
            scope.add_inv_all_bevs = [];
          }
        }).
        error(function(data, status, headers, config) {

        });
      };
      scope.getAllInv();

      scope.applyDistributorFilter = function() {
        // If there is a selected distributor, hides all inv items which don't
        // belong to that distributor.  If there is no selected distributor,
        // restores all invs 
        if (scope.new_delivery.distributor_obj === null || !scope.dist_checked) {
          scope.add_inv_dist_bevs = scope.add_inv_all_bevs;
        } else {
          // When filtering all distributor bevs, push all_bevs into dist_bevs
          // which match the distributor, then remove any unadded and added bevs
          // which are not of distributor.  Do this whenever distributor changes.
          scope.add_inv_dist_bevs = [];
          for (var i in scope.add_inv_all_bevs) {
            var item = scope.add_inv_all_bevs[i];
            if (item.distributor_id !== null && item.distributor_id === scope.new_delivery.distributor_obj.id) {
              scope.add_inv_dist_bevs.push(item);
            }
          }
          // remove any already added bevs which don't match distributor
          var new_added_bevs = [];
          for (var i in scope.new_delivery.delivery_items) {
            var item = scope.new_delivery.delivery_items[i];
            if (item.distributor_id !== null && item.distributor_id === scope.new_delivery.distributor_obj.id) {
              new_added_bevs.push(item);
            }
          }
          scope.new_delivery.delivery_items = new_added_bevs;
        }
        
        // unadded bevs is add_inv_dist_bevs minus new_delivery.delivery_items
        var new_unadded_bevs = [];
        for (var i in scope.add_inv_dist_bevs) {
          var item = scope.add_inv_dist_bevs[i];
          var is_unadded = true;
          for (var j in scope.new_delivery.delivery_items) {
            var added_item = scope.new_delivery.delivery_items[j];
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

        scope.refreshAddGrandTotal();
      };

      scope.cleanUpExistingInv = function() {
        // On the client side, remove any entries in add_inv_unadded_bevs
        // which are already in this location
        var clean_bevs = [];
        for (var i=0; i < scope.add_inv_unadded_bevs.length; i++) {

          var is_clean = true;
          var test_item = scope.add_inv_unadded_bevs[i];
          for (var j=0; j < scope.new_delivery.delivery_items.length; j++) {
            var check_item = scope.new_delivery.delivery_items[j];
            if (check_item['type'] === "keg") {
              continue;
            }
            if (!scope.is_edit) {
              if (test_item['version_id'] == check_item['version_id'])
              {
                is_clean = false;
                break;
              }
            } else {
              if (test_item['id'] == check_item['beverage_id'])
              {
                is_clean = false;
                break;
              }
            }
            
          }
          if (is_clean) {
            clean_bevs.push(test_item);
          }
        }
        scope.add_inv_unadded_bevs = clean_bevs;
      };

      scope.refreshAddInv = function() {
        scope.applyDistributorFilter();
        scope.cleanUpExistingInv();
      }

      scope.addInvAddBev = function(bev) {

        bev['value'] = 0;
        bev['quantity'] = 0;

        scope.new_delivery.delivery_items.push(bev);

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

        if (inv.value !== null) {
          inv.value = inv.quantity * inv.unit_cost;
        }

        inv.quantity = MathService.fixFloat2(inv.quantity);
        inv.value = MathService.fixFloat2(inv.value);

        scope.refreshAddGrandTotal();

        scope.checkEditDiffs();
      };

      scope.addInvQtyChanged = function(inv) {
        var new_qty = MathService.fixFloat2(parseFloat(inv['quantity']));

        if (MathService.numIsInvalid(new_qty) || new_qty === null) {
          return;
        }

        inv.value = MathService.fixFloat2(new_qty * inv.unit_cost);

        scope.refreshAddGrandTotal();

        scope.checkEditDiffs();
      };

      scope.refreshAddGrandTotal = function() {
        scope.add_grand_total = 0;
        for (var i in scope.new_delivery.delivery_items) {
          var item = scope.new_delivery.delivery_items[i];
          if (item['value']!==undefined && item['value']!==null)
          scope.add_grand_total += item.value;
        }
      }

      scope.commitRemoveInvItem = function(item) {

        for ( var i=scope.new_delivery.delivery_items.length-1; i >= 0; i--) {
          if ( scope.new_delivery.delivery_items[i].id === item.id) {
            var removed = scope.new_delivery.delivery_items.splice(i, 1);
            break;
          }
        };

        // push removed item back into unadded items
        item['quantity'] = 0;
        item['value'] = 0;
        scope.refreshAddInv();

        setInterval(
          function() {
            scope.$apply();
            //scope.addInvControl.reSort();
          }, 0);

        if (scope.is_edit) {
          swal({
            title: "Item Removed",
            text: "Don't forget to <b>Save Changes</b> when you're done editing this Delivery for this removal to take effect.",
            type: "warning",
            html: true,
            confirmButtonText: "Ok",
            closeOnConfirm: true });
        }

        scope.checkEditDiffs();
        scope.refreshAddGrandTotal();
      };

      scope.removeInvItem = function(index) {
        var item = scope.new_delivery.delivery_items[index];
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
          closeOnConfirm: !scope.is_edit },
          function() {
            scope.commitRemoveInvItem(item);
          });
      };

      scope.selectDistributor = function(dist) {

        scope.clearValidation();

        console.log("Selected dist " + dist);
        
        // if coming from no distributor, default the "show only bevs from this
        // distributor" option.  Otherwise, preserve user's previous selection
        if (scope.new_delivery.distributor_obj === null) {
          scope.dist_checked = true;
        }

        scope.new_delivery.distributor_obj = dist;
        if (dist !== null) {
          scope.new_delivery.distributor_id = dist.id;
          scope.new_delivery.distributor = dist.name;
        }

        scope.refreshAddInv();

        scope.checkEditDiffs();

      };

      scope.toggleDistBevsOnly = function() {
        scope.dist_checked = !scope.dist_checked;
        scope.refreshAddInv();

        scope.checkEditDiffs();
      };

      scope.clearDistributor = function() {
        scope.new_delivery.distributor_obj = null;
        scope.new_delivery.distributor_id = null;
        scope.new_delivery.distributor = null;

        scope.checkEditDiffs();
      };

      scope.showAddBevInv = function() {
        scope.show_add_bev_ui = true;
        
        scope.refreshAddInv();
      };

      scope.hideAddBevInv = function() {
        scope.show_add_bev_ui = false;
      };

      scope.checkEditDiffs = function() {
        // Run this function when is_edit and UI has been touched by user
        // to check whether should display warning that changes have been
        // made and won't be saved until committed
        if (!scope.is_edit) {
          return;
        }

        if (JSON.stringify(scope.new_delivery) !== JSON.stringify(scope.editDelivery)) {
          scope.save_warning = true;
          return true;
        } else {
          scope.save_warning = false;
        }
        return false;
      };
      scope.checkEditDiffs();

      scope.editBev = function(bev_i) {
        // when the user is creating a new Delivery, and they're selecting
        // beverages to add to the Delivery, they can edit the beverage
        // details from this page for convenience, in case there were e.g., 
        // last minute price changes
        console.log(scope.new_delivery.delivery_items[bev_i]);
        var bev = scope.new_delivery.delivery_items[bev_i];

        $http.get('/inv', {
          params: {id: bev.id}
        }).
          success(function(data, status, headers, config) {
            // this callback will be called asynchronously when the response
            // is available
            console.log(data);

            var inv = data[0];

            // fix a list of known keys to be decimal precision 2
            var fix_num_keys = [
            'abv',
            'count',
            'purchase_cost',
            'purchase_volume',
            ];
            for (var j in fix_num_keys) {
              var fix_key = fix_num_keys[j];
              if ( inv[fix_key] !== undefined && inv[fix_key] !== null ) {
                inv[fix_key] = MathService.fixFloat2(inv[fix_key]);
              }
            }

            // if size_prices is null, make them empty array
            if (inv.size_prices === null) {
              inv.size_prices = [];
            }
            // fix size_prices to be decimal precision 2
            for (var j in inv.size_prices) {
              inv.size_prices[j]['price'] = MathService.fixFloat2(inv.size_prices[j]['price']);
              inv.size_prices[j]['volume'] = MathService.fixFloat2(inv.size_prices[j]['volume']);
            }

            // server passes us distributor_id and keg_id, but we need to resolve
            // the distributor and keg objects based on all_distributors and all_kegs
            inv['distributor'] = null;
            inv['keg'] = null;
            // if beverage has a distributor_id, need to pre-populate its 
            // distributor entry
            if (inv['distributor_id'] !== null) {
              var dist;
              for (var j in scope.allDistributors) {
                dist = scope.allDistributors[j];
                if (dist.id === inv['distributor_id']) {
                  inv['distributor'] = dist;
                  break;
                }
              }
              // if there's also a keg_id, pre-populate with keg entry
              if (inv['keg_id'] !== null && dist.kegs !== null) {
                for (var j in dist.kegs) {
                  var keg = dist.kegs[j];
                  if (keg.id === inv['keg_id']) {
                    inv['keg'] = keg;
                    break;
                  }
                }
              }
            }

            console.log(inv);
            scope.editBevLaunchModal(inv);
          }).
          error(function(data, status, headers, config) {

          });
      };

      scope.editBevLaunchModal = function(inv) {
        var modalEditInstance = $modal.open({
          templateUrl: 'editInvModal.html',
          controller: 'editInvModalCtrl',
          windowClass: 'edit-purchase-modal',
          backdropClass: 'green-modal-backdrop',
          resolve: {
            edit_beverage: function() {
              return inv;
            },
            all_distributors: function() {
              return scope.allDistributors;
            },
            all_breweries: function() {
              // we're invoking the modal in edit purchase info only, so don't
              // need to provide breweries
              return [];
            },
            volume_units: function() {
              return scope.volume_units;
            },
            edit_mode: function() {
              return "purchase";
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
            var edit_bev = result[1];
            
            // after a save, we want to re-calculate cost per mL, for instance
            if (status === 'save') {
              console.log(edit_bev);

              // now need to update all client bevs with the new bev info passed
              // to us in edit_bev
              var update_invs = [
                scope.add_inv_all_bevs,
                scope.add_inv_dist_bevs,
                scope.add_inv_unadded_bevs,
                scope.new_delivery.delivery_items
              ];

              for (var i in update_invs) {
                var inv_list = update_invs[i];
                for (var j in inv_list) {
                  var item = inv_list[j];
                  if (item['version_id'] === edit_bev['version_id']) {
                    // we want to copy the new edit_bev into the inv list, 
                    // but we want to preserve / recalculate quantity, 
                    // inventory, and unit cost
                    var old_quantity = item['quantity'];

                    var new_item = JSON.parse( JSON.stringify( edit_bev ) );

                    // locally calculate unit_cost for sorting purposes
                    var purchase_cost = 0;
                    var purchase_count = 1;
                    var deposit = 0;
                    if (new_item['purchase_cost'] !== null) {
                      purchase_cost = new_item['purchase_cost'];
                    }
                    if (new_item['purchase_count'] !== null) {
                      purchase_count = new_item['purchase_count'];
                    }
                    if (new_item['deposit'] !== null) {
                      deposit = new_item['deposit'];
                    }
                    new_item['unit_cost'] = purchase_cost / purchase_count + deposit;
                    new_item['quantity'] = old_quantity;
                    new_item['value'] = old_quantity * new_item['unit_cost'];

                    // change distributor back from object to name.  Before we
                    // sent inv item to edit bev directive, we had to set its
                    // distributor to an object.  But while displaying in the
                    // scroll list, distributor is a string of distributor name.
                    if (new_item['distributor']!==undefined && new_item['distributor']!==null) {
                      var dist_name = new_item['distributor'].name;
                      console.log(dist_name);
                      new_item['distributor'] = dist_name
                    }

                    inv_list[j] = new_item;

                    break;
                  }
                }
              }

              scope.refreshAddGrandTotal();

              swal({
                title: "Beverage Updated!",
                text: "<b>" + edit_bev.product + "</b> has been updated with your changes.",
                type: "success",
                timer: 4000,
                allowOutsideClick: true,
                html: true});
            }
          }, 
          // error status
          function() {
            ;
          });
        };

    }
  }
});