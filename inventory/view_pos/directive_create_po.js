angular.module('myApp')

.directive('createPurchaseOrder', function($modal, $http, ContactService, DateService, DistributorsService, ItemsService, MathService, VolUnitsService) {
  return {
    restrict: 'AE',
    scope: {
      control: '=',
      closeOnSave: '&'
    },
    templateUrl: './view_pos/template_create_po.html',
    link: function(scope, elem, attrs) {

      scope.internalControl = scope.control || {};

      scope.showMode = 0;
      scope.useMode = null;

      scope.all_bevs = [];

      scope.all_distributors = [];
      scope.sel_distributors = [];

      // for create new bev
      scope.all_breweries = [];
      scope.volume_units_full = [];
      scope.volume_units = [];
      scope.newBevControl = {};

      scope.order_date_types = ['Immediately', 'A Future Date'];
      scope.send_methods = ['Send via Email', 'Send via Text', "Save & Don't Send"];

      scope.add_mode = 1;
      scope.add_modes = ['Existing Beverages in DB', 'Create New Beverage']

      scope.order = {};
      scope.order['restaurant_name'] = null;
      scope.order['purchase_contact'] = null;
      scope.order['purchase_email'] = null;
      scope.order['purchase_phone'] = null;
      scope.order['purchase_fax'] = null;
      scope.order['purchase_cc'] = null
      scope.order['po_num'] = null;
      scope.order['send_later'] = false;
      scope.showPurchaseSave = false;
      scope.defaultContactChecked = {'value':true};
      // the global delivery date which will be applied to dorders at start
      scope.order['delivery_date'] = null;
      scope.order['dist_orders'] = [];
      scope.order['order_date'] = null;
      scope.order['order_date_type'] = scope.order_date_types[0];
      scope.order['order_date_pretty'] = null;
      //scope.order['order_date_pretty'] = DateService.getPrettyDate((new Date()).toString(), false, true);
      scope.order['send_method'] = null;
      scope.order['grand_total'] = null;
      scope.deliveryAddressControl = {};

      scope.showBudget = true;
      scope.remaining_monthly_budget = null;

      scope.form_ver = {};
      scope.new_failure_msg = null;
      scope.error_date_msg = null;

      scope.note_char_limit = 140;

      // =======================================================================
      // dates for purchase history for copying old POs
      // =======================================================================
      scope.searchPOControl = {};
      scope.old_purchase_orders = [];

      scope.startDateLocal = function() {
        return DateService.clientTimeToRestaurantTime(scope.start_date.date);
      };

      scope.endDateLocal = function() {
        return DateService.clientTimeToRestaurantTime(scope.end_date.date);
      };

      scope.getOldPurchaseOrders = function() {
        var params = { 
          start_date: scope.startDateLocal(),
          end_date: scope.endDateLocal(),
          include_pending: true
        };
        $http.get('/purchase/all', 
          {params: params })
        .success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          scope.old_purchase_orders = data;

          ItemsService.processPurchaseOrders(scope.old_purchase_orders);

        })
        .error(function(data, status, headers, config) {

        });

      };

      scope.getBudget = function() {
        scope.budget_alert_email = null;
        scope.total_monthly_budget = null;
        scope.remaining_monthly_budget = null;
        var test_user_id = 1;
        $http.get('/budget', {
          params: {
            user_id: test_user_id
          }
        }).
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          if (data != null) {
            scope.total_monthly_budget = data["monthly_budget"];
            scope.remaining_monthly_budget = data["remaining_budget"];
            scope.budget_alert_email = data["budget_alert_email"];
          }
        }).
        error(function(data, status, headers, config) {

        });
      };
      scope.getBudget();

      scope.viewOldPurchaseOrder = function(purchase_order) {
        var params = { 
          id: purchase_order.order.id
        };
        $http.get('/purchase', 
          {params: params })
        .success(function(data, status, headers, config) {
          console.log(data);
          
          var modalEditInstance = $modal.open({
            templateUrl: 'reviewPurchaseOrderModal.html',
            controller: 'reviewPurchaseOrderModalCtrl',
            windowClass: 'review-purch-modal',
            backdropClass: 'white-modal-backdrop',
            backdrop : 'static',
            resolve: {
              content_type: function() {
                if (purchase_order.order.send_method==="email") {
                  return "pdf";
                } else if (purchase_order.order.send_method==="text") {
                  return "sms";
                } else {
                  return "html";
                }
                
              },
              review_obj: function() {
                if (purchase_order.order.send_method==="email") {
                  var URL = data['url'];
                  return URL;
                } else if (purchase_order.order.send_method==="text") {
                  return data;
                } else {
                  var po = data;
                  ItemsService.processPurchaseOrders([po]);
                  return po;
                }
                
              },
              post_order: function() {
                return null;
              },
              read_mode: function() {
                return 'sent';
              },
              po_id: function() {
                return null;
              },
              send_later: function() {
                return false;
              }
            }
          });
        })
        .error(function(data, status, headers, config) {

        });
      };

      scope.initDate = function() {
        var today = new Date();
        scope.start_date = {date:null};
        scope.start_date.date = new Date(today.setDate(today.getDate() - 6));
        scope.start_date.date.setHours(0,0,0,0);
        scope.end_date = {date:null};
        scope.end_date.date = new Date();
        scope.end_date.date.setHours(23,59,59,999);

        scope.getOldPurchaseOrders();
      };
      scope.initDate();

      scope.startDateChanged = function() {
        console.log(scope.start_date.date);

        scope.selectedCopyPO.id = null;

        scope.searchPOControl.deactivate();

        scope.getOldPurchaseOrders();
      };

      scope.endDateChanged = function() {
        console.log(scope.end_date.date);

        scope.selectedCopyPO.id = null;

        scope.searchPOControl.deactivate();

        scope.getOldPurchaseOrders();
      };

      scope.searchByPO = function(query) {
        scope.selectedCopyPO.id = null;

        var po_num = query;
        if (po_num.length < 4) {
          swal({
            title: "Invalid PO Num",
            text: "The PO Num you provided is too short!  Please enter a valid PO num.",
            type: "warning",
            timer: 4000,
            allowOutsideClick: true});
        }

        var params = {
          po_num: po_num
        };
        $http.get('/purchase/po',
          {params: params})
        .success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          scope.old_purchase_orders = data;

          ItemsService.processPurchaseOrders(scope.old_purchase_orders);
          // return true to searchClickBox directive to highlight
          scope.searchPOControl.activate();

        })
        .error(function(data, status, headers, config) {
          // return false to searchClickBox directive to inactivate highlight
          scope.searchPOControl.deactivate();
        });
      };

      scope.selectedCopyPO = {id:null};
      scope.copyQuantityOptions = ['Copy previous Quantities', 'Start Quantities from scratch'];
      scope.copyQuantities = {value:null};
      scope.selectCopyPO = function(po) {
        console.log(po);
        scope.selectedCopyPO.id = po.order.id;
      };

      scope.confirmCopyPO = function() {
        scope.setShowMode(1, 'copy');
      };

      scope.getCopyPurchaseOrder = function() {

        var params = { 
          copy_id: scope.selectedCopyPO.id
        };

        $http.get('/purchase/copy',
          {params: params}).
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          if (data != null) {
            var new_po = data;
            scope.order['purchase_contact'] = new_po['order']['purchase_contact'];
            scope.order['purchase_contact_edit'] = new_po['order']['purchase_contact'];
            scope.order['purchase_email'] = new_po['order']['purchase_email'];
            scope.order['purchase_email_edit'] = new_po['order']['purchase_email'];
            scope.order['purchase_phone'] = new_po['order']['purchase_phone'];
            scope.order['purchase_phone_edit'] = new_po['order']['purchase_phone'];
            scope.order['purchase_fax'] = new_po['order']['purchase_fax'];
            scope.order['purchase_fax_edit'] = new_po['order']['purchase_fax'];
            if (new_po['order']['purchase_cc']!==null && new_po['order']['purchase_cc'].length > 0) {
              scope.order['purchase_cc'] = new_po['order']['purchase_cc'][0]['email'];
              scope.order['purchase_cc_edit'] = new_po['order']['purchase_cc'][0]['email'];
            }
            
            for (var i in new_po.distributor_orders) {
              var dist_order = new_po.distributor_orders[i];

              // if user specified to copy quantities from previous PO,
              // set copy_quantity_str to 'copy' so addPrepopulatedDistributorOrder
              // knows to handle it
              var copy_quantity_str = '';
              if (scope.copyQuantities.value===scope.copyQuantityOptions[0]) {
                copy_quantity_str = 'copy';
              }
              scope.addPrepopulatedDistributorOrder(dist_order, true, copy_quantity_str);
            }

            scope.refreshSelectableDistributors();
            /*
            for (var i in data) {
              var dist_order = data[i];
              if (dist_order.items !== null && dist_order.items.length > 0) {
                scope.addCopyDistributorOrder(dist_order['distributor_id'], dist_order.items);
              }
            }
            scope.refreshSelectableDistributors();
            */
          } else {
            ;
          }
          
        }).
        error(function(data, status, headers, config) {

        });
      };

      // =======================================================================
      // end dates for purchase history
      // =======================================================================

      scope.showAutoHelp = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        var help_content = "Automatic PO works by comparing " + 
        "the par levels of all <i>actively sold</i> beverages against the stock " + 
        "levels from your latest inventory records, and automatically " +
        "ordering to make up the difference.<br/><br/>" + 
        "First, to determine which beverages are <i>active</i> and what " + 
        "their par levels should be, make sure your list of Active and " +
        "Seasonal beverages " + 
        "are up-to-date in the <b>Menu Plan</b> page." + 
        ".<br/><br/>" + 
        "Then, to determine recent stock levels, record inventory in the " + 
        "<b>Count Inventory</b> page within the last 3 days.<br/><br/>" + 
        "And that's it!  POs will be populated with your " +
        "active beverages, with the quantities automatically determined." + 
        "<br/><hr/>" + 
        "For example, let's say we're selling a bar staple named 'BeerA'. " + 
        "<br/></br>" + 
        "First, we add 'BeerA' to the Staples list in the <b>Menu Plan</b>, " + 
        "and set the Par level to 3 kegs.<br/><br/>" + 
        "On Monday, during weekly inventorying, we count 2 kegs of 'BeerA' " + 
        "in our storage via the <b>Count Inventory</b> page.<br/><br/>" + 
        "On Tuesday, we're ready to replenish our inventory, and choose to " +
        "create a PO via the Automatic / Match Par option.  The app will " + 
        "put in an order of 1 keg of 'BeerA' to the distributor."
        swal({
          title: "Automatic Purchasing",
          text: help_content,
          /*type: "success",*/
          allowOutsideClick: true,
          html: true});
      };

      scope.getRestaurant = function() {
        var test_restaurant_id = 1;

        $http.get('/restaurant/name', {
          params: {
            restaurant_id: test_restaurant_id
          }
        }).
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          if (data != null) {
            scope.order['restaurant_name'] = data['name'];
          }
          else {
            scope.order['restaurant_name'] = null;
          }
        }).
        error(function(data, status, headers, config) {

        });

        $http.get('/restaurant/purchase').
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          if (data != null) {
            scope.order['purchase_contact'] = data['purchase_contact'];
            scope.order['purchase_contact_edit'] = data['purchase_contact'];
            scope.order['purchase_email'] = data['purchase_email'];
            scope.order['purchase_email_edit'] = data['purchase_email'];
            scope.order['purchase_phone'] = data['purchase_phone'];
            scope.order['purchase_phone_edit'] = data['purchase_phone'];
            scope.order['purchase_fax'] = data['purchase_fax'];
            scope.order['purchase_fax_edit'] = data['purchase_fax'];
            // need a little special processing here
            // purchase_cc is a list of objects:
            //     [{id:int, email:string}]
            // It should only have one entry returned, so convert its email value
            // into a string locally
            if (data['purchase_cc']!==null && data['purchase_cc'].length > 0) {
              var email = data['purchase_cc'][0]['email'];
              scope.order['purchase_cc'] = email;
              scope.order['purchase_cc_edit'] = email;
            } else {
              scope.order['purchase_cc'] = null;
              scope.order['purchase_cc_edit'] = null;
            }
            
          }
          else {
            scope.order['purchase_contact'] = null;
            scope.order['purchase_contact_edit'] = null;
            scope.order['purchase_email'] = null;
            scope.order['purchase_email_edit'] = null;
            scope.order['purchase_phone'] = null;
            scope.order['purchase_phone_edit'] = null;
            scope.order['purchase_fax'] = null;
            scope.order['purchase_fax_edit'] = null;
            scope.order['purchase_cc'] = null;
            scope.order['purchase_cc_edit'] = null;
          }
        }).
        error(function(data, status, headers, config) {

        });

      };

      scope.selectOrderDateType = function(index) {
        scope.order['order_date_type'] = scope.order_date_types[index];
        if (index===0) {
          scope.order['order_date'] = new Date();
        }
      };

      scope.getNewEmptyDistributorOrder = function() {
        return {
          distributor:null, 
          delivery_date: null, 
          addable_items: [],
          items:[],
          total:null,
          show_add_ui:false,
          addableControl: {},
          sort_key: null,
          additional_notes: null,
          save_default_email: null,
          save_default_phone: null,
          double_sort: -1,
          add_mode: 0,
          addUIStyle: {width:'800px'}
        };
      }

      scope.addEmptyDistributorOrder = function() {
        scope.order['dist_orders'].push(
          scope.getNewEmptyDistributorOrder());
      };

      scope.addPrepopulatedDistributorOrder = function(copy_dorder, isCopyPO, quantityCopyOrPar) {

        var new_dorder = scope.getNewEmptyDistributorOrder();
        new_dorder.delivery_date = scope.order['delivery_date'];

        for (var i in scope.all_distributors) {
          var dist = scope.all_distributors[i];
          if (dist['id'] === copy_dorder['distributor_id']) {
            scope.selectDistributor(new_dorder, dist);
            break;
          }
        }

        if (isCopyPO===true) {
          new_dorder['additional_notes'] = copy_dorder['additional_notes'];
          new_dorder['distributor_email'] = copy_dorder['distributor_email'];
          new_dorder['distributor_phone'] = copy_dorder['distributor_phone'];
        }

        // for each of the items in @items, find the corresponding addable bev
        // from scope.all_bevs, and add it to this dorder using scope.addItem,
        // and automatically resolve its par using scope.matchQuantityToPar
        for (var i in copy_dorder.items) {
          var copy_bev = copy_dorder.items[i];
          var bev = null;
          for (var j in scope.all_bevs) {
            var check_bev = scope.all_bevs[j];
            if (copy_bev['version_id'] === check_bev['version_id']) {
              bev = check_bev;
              break;
            }
          }
          if (bev !== null) {
            scope.addItem(new_dorder, bev);

            if (isCopyPO===true) {
              // this is for copying an existing PO, so copy_bev will have things
              // we will want to copy
              if (quantityCopyOrPar==='copy') {
                bev['quantity'] = copy_bev['quantity'];
              }
              //if we're copying PO, we want to apply discounts regardless
              // of copying quantities or starting from scratch
              //
              // copy apply discounts if any exist,
              // and recalculate resolved_subtotal based on new quantity
              // and discounts.
              bev['additional_pricing'] = copy_bev['additional_pricing'];
              bev['additional_pricing_description'] = copy_bev['additional_pricing_description'];
              bev['additional_pricing_short'] = ItemsService.getAdditionalPricingShortDescription(
                copy_bev['additional_pricing'],
                bev['container_type'],
                bev['purchase_count'],
                true);

              scope.updateQuantity(bev, new_dorder);
            } else {
              // this is for automatic POs, so we're only interested in matching
              // quantities to par
              scope.matchQuantityToPar(bev, new_dorder);
            }
          }
        }

        scope.order['dist_orders'].push(new_dorder);
      }

      scope.initForm = function() {
        scope.new_failure_msg = null;
        scope.refreshSelectableDistributors();
        scope.getPONum();
        // don't forget to clear form verification!
        scope.form_ver = {};
      }

      scope.initManualForm = function() {

        scope.getAllDistributors(false, false);

        // must call this after getAllDistributors, since it calls
        // refereshSelectableDistributors()
        scope.initForm();
        scope.addEmptyDistributorOrder();
        
        scope.getRestaurant();

      };

      scope.initAutoForm = function() {

        scope.order['dist_orders'] = [];
        scope.getAllDistributors(true, false);
        // getAllDistributors will call getAutoPurchaseOrder after it's done

        // must call this after getAllDistributors, since it calls
        // refereshSelectableDistributors()
        scope.initForm();

        scope.getRestaurant();

      };

      scope.initCopyForm = function() {
        scope.getAllDistributors(false, true);

        // must call this after getAllDistributors, since it calls
        // refereshSelectableDistributors()
        scope.initForm();

        // don't call getRestaurant, that should copy from the
        // previous purchase order
      }

      scope.getPONum = function() {
        // get the next available unique id for this purchase order
        $http.get('/purchase/nextponum').
        success(function(data, status, headers, config) {
          console.log(data);
          if (data != null) {
            scope.order['po_num'] = data['po_num'];
          } else {
            ;
          }
          
        }).
        error(function(data, status, headers, config) {

        });
      };

      scope.getAutoPurchaseOrder = function() {
        $http.get('/purchase/auto').
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          if (data != null) {
            // for each distributor order in the returned list, create a dorder
            // using the distributor id if it has valid items
            for (var i in data) {
              var dist_order = data[i];
              if (dist_order.items !== null && dist_order.items.length > 0) {
                scope.addPrepopulatedDistributorOrder(dist_order, false, 'par');
              }
            }
            scope.refreshSelectableDistributors();
          } else {
            ;
          }
          
        }).
        error(function(data, status, headers, config) {

        });
      };

      scope.selectSendMethod = function(method_i, change_show) {
        scope.order['send_method'] = scope.send_methods[method_i];

        // if text only, have a shorter comment char limit
        if (method_i == 1) {
          scope.note_char_limit = 64;
        } else {
          scope.note_char_limit = 140;
        }

        // enforce note character limit
        for (var j in scope.order.dist_orders) {
          var dorder = scope.order.dist_orders[j];
          console.log(dorder['additional_notes']);
          if (dorder['additional_notes'] !== null && dorder['additional_notes'].length > scope.note_char_limit) {
            dorder['additional_notes'] = dorder['additional_notes'].substring(0, scope.note_char_limit);
          }
        }

        if (change_show===true) {
          scope.setShowMode(3, scope.useMode);
        }
      }

      scope.setShowMode = function(mode, use_mode) {
        scope.showMode = mode;

        // showModes:
        // 0  : the start screen, choosing auto / manual / previous
        // 1  : when should PO be sent, when delivered
        // 2  : how should it be sent?  email / sms / save only
        // 3  : PO form
        // 11 : If copying, the list of previous POs, and start from scratch or previous quantities

        // if mode is 0 we are resetting everything
        if (mode === 0) {
          scope.order['dist_orders'] = [];
          scope.order['delivery_date'] = null;
          scope.order['order_date'] = null;
          scope.order['order_date_type'] = scope.order_date_types[0];
          scope.selectedCopyPO.id = null;
          scope.copyQuantities.value = null;
        }

        if (use_mode !== null) {
          scope.useMode = use_mode;
        }

        if (mode===3) {
          if (scope.order['order_date']===null) {
            scope.order['order_date'] = new Date();
          }
          var date_str = scope.order['order_date'].toString();
          scope.order['order_date_pretty'] = DateService.getPrettyDate(date_str, false, true);
          if (use_mode === 'manual') {
            scope.initManualForm();
          } else if (use_mode==='auto') {
            scope.initAutoForm();
          } else if (use_mode==='copy') {
            scope.initCopyForm();
          }
        }

        if (mode===11) {
          // for copy PO, need to refetch old purchase orders
          scope.getOldPurchaseOrders();
        }
        
      };

      scope.cancelPurchaseOrder = function(force) {

        var queryCancel = false;
        for (var i in scope.order['dist_orders']) {
          var dorder = scope.order['dist_orders'][i];
          if (dorder['distributor'] !== null) {
            queryCancel = true;
          }
        }

        if (queryCancel === true && force!==true) {
          swal({
              title: "Discard Purchase Order?",
              text: "Going back will discard this Purchase Order and clear any changes you've made.  Are you sure?",
              type: "warning",
              showCancelButton: true,
              html: true,
              confirmButtonColor: "#DD6B55",
              confirmButtonText: "Yes, discard it!"
              },
              function() {
                scope.setShowMode(0, null);
                scope.$apply();
            });
        } else {
          scope.setShowMode(0, null);
        }
        
      };

      scope.confirmDeliveryDate = function() {
        if (!DateService.isValidDate(scope.order['delivery_date'])) {
          return;
        }

        scope.setShowMode(2, null);
      };

      scope.orderDateChanged = function() {
        var date_str = scope.order['order_date'].toString();
        scope.order['order_date_pretty'] = DateService.getPrettyDate(date_str, false, true);
        scope.$apply();

        var odate = scope.order['order_date'];
        if (odate===null) {
          return;
        }

        var today = new Date();
        // determine whether the date is send now or send on future day
        if ( DateService.isSameDay(today, odate) ) {
          scope.order['send_later'] = false;
        } else if (DateService.isFutureDay(today, odate)) {
          scope.order['send_later'] = true;
        } else {
          scope.order['send_later'] = false;
        }

        // if sending different month, don't show the remaining budget
        if (scope.order['order_date'].getMonth() !== today.getMonth()) {
          scope.showBudget = false;
        } else {
          scope.showBudget = true;
        }

      };

      scope.purchasingChanged = function() {
        if (scope.order['purchase_contact_edit'] === '') {
          scope.order['purchase_contact_edit'] = null;
        }
        if (scope.order['purchase_email_edit'] === '') {
          scope.order['purchase_email_edit'] = null;
        }
        if (scope.order['purchase_phone_edit'] === '') {
          scope.order['purchase_phone_edit'] = null;
        }
        if (scope.order['purchase_fax_edit'] === '') {
          scope.order['purchase_fax_edit'] = null;
        }
        if (scope.order['purchase_cc_edit'] === '') {
          scope.order['purchase_cc_edit'] = null;
        }

        if (scope.order['purchase_contact'] !== scope.order['purchase_contact_edit'] ||
          scope.order['purchase_email'] !== scope.order['purchase_email_edit'] ||
          scope.order['purchase_phone'] !== scope.order['purchase_phone_edit'] || 
          scope.order['purchase_fax'] !== scope.order['purchase_fax_edit'] ||
          scope.order['purchase_cc'] !== scope.order['purchase_cc_edit']) {
          scope.showPurchaseSave = true;
        } else {
          console.log("NO CHANGE");
          scope.showPurchaseSave = false
        }
      };

      scope.selectAddMode = function(dist_order, mode) {
        if (mode === scope.add_modes[dist_order.add_mode]) {
          return;
        }

        dist_order.add_mode = scope.add_modes.indexOf(mode);
        if (dist_order.add_mode===0) {
          dist_order.addUIStyle = {width:'800px'}
        } else {
          dist_order.addUIStyle = {width:'96%'};
        }
      };

      scope.showAddInv = function(dist_order) {
        dist_order.show_add_ui = true;

        scope.selectAddMode(dist_order, scope.add_modes[0]);
      };

      scope.hideAddInv = function(dist_order) {
        dist_order.show_add_ui = false;
      };

      scope.addItem = function(dist_order, item) {
        
        item['quantity'] = null;
        item['additional_pricing'] = null;
        item['additional_pricing_short'] = null;
        item['additional_pricing_description'] = null;

        console.log(item);

        for (var i in dist_order.addable_items) {
          var check_item = dist_order.addable_items[i];
          if (check_item.version_id === item.version_id) {
            dist_order.items.push(item);
            dist_order.addable_items.splice(i, 1);
            break;
          }
        }

        if (dist_order.addableControl.applyTypeFilter !== undefined) {
          dist_order.addableControl.applyTypeFilter();
        }
        
        console.log(dist_order.addable_items);
      };

      scope.removeAddedItem = function(item) {
        for (var i in scope.order.dist_orders) {
          var dorder = scope.order.dist_orders[i];
          for (var j in dorder.items) {
            var check_item = dorder.items[j];
            if (check_item === item) {
              dorder.items.splice(j, 1);
              dorder.addable_items.push(item);
              dorder.addableControl.applyTypeFilter();
              scope.updateDistOrderTotal(dorder);
              break;
            }
          }
        }
      };

      scope.addAdditionalNote = function(dorder) {
        dorder['additional_notes'] = '';
      };

      scope.updateQuantity = function(item, dorder) {
        if (item['quantity'] === '') {
          item['quantity'] = null;
          item['subtotal'] = null;
          item['resolved_subtotal'] = null;
          scope.updateDistOrderTotal(dorder);
          return;
        }

        console.log('quantity is ' + item['quantity']);
        if (MathService.numIsInvalidOrNegative(item['quantity'])) {
          item['subtotal'] = null;
          item['resolved_subtotal'] = null;
          scope.updateDistOrderTotal(dorder);
          return;
        }

        item['subtotal'] = item['batch_cost'] * item['quantity'];
        if (item['additional_pricing']!==null && item['additional_pricing']!==undefined) {
          item['resolved_subtotal'] = ItemsService.getResolvedSubtotal(item);
        } else {
          item['resolved_subtotal'] = item['subtotal'];
        }

        scope.updateDistOrderTotal(dorder);
      };

      scope.matchQuantityToPar = function(item, dorder) {
        if (item['par']===null) {
          return;
        }

        var count_recent = 0;
        if (item['count_recent']!==null) {
          count_recent = item['count_recent']
        }

        var diff = item['par'] - count_recent;
        if (diff <= 0) {
          item['quantity'] = 0;
        } else {
          // if item is ordered by the case (has purchase_count > 1), need to divide
          // quantity by purchase_count
          if (item.purchase_count > 1) {
            item['quantity'] = Math.ceil(diff / item.purchase_count);
          } else {
            item['quantity'] = Math.ceil(diff);
          }
          
        }
        scope.updateQuantity(item, dorder);

        return item['quantity'];
        
      };

      scope.getVolUnits = function() {
        var result = VolUnitsService.get();
        result.then(
          function(payload) {
            var data = payload.data;
            if (data !== null) {
              scope.volume_units_full = data;
              scope.volume_units = [];
              for (var i=0; i < data.length; i++)
              {
                scope.volume_units.push(data[i].abbr_name);
              }
            }
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };

      scope.getAllDistributors = function( doAuto, doCopy ) {

        scope.getVolUnits();

        scope.all_distributors = [];

        var result = DistributorsService.get();
        result.then(function(payload) {
          var data = payload.data;
          
          for (var i in data) {
            var dist = data[i];
            dist['email_edit'] = dist['email'];
            dist['phone_edit'] = dist['phone'];
            dist['contact_name_edit'] = dist['contact_name'];
            scope.all_distributors.push(dist);
            scope.sel_distributors.push(dist);
          }

          // keep this here, as it depends on getting distributors
          // finishing first
          if (doAuto === true) {
            scope.getAutoPurchaseOrder();
          } else if (doCopy === true) {
            scope.getCopyPurchaseOrder();
          }

          console.log(data);
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };

      // for create new beverage from addable bevs UI
      scope.newBeverageCloseOnSave = function(new_beverage) {

        ItemsService.processBevsForAddable([new_beverage]);

        scope.all_bevs.push(new_beverage);

        // XXX make sure appears in addable list for distributor

        if (scope.all_breweries.indexOf(new_beverage['brewery']) < 0) {
          scope.all_breweries.push(new_beverage['brewery']);
        }

        // closeonsave callback doesn't pass us distributor order, so need 
        // to resolve the associated dist_order, if any, of new_beverage
        // by looking at its distributor id
        var new_bev_dist_id = new_beverage['distributor_id'];
        for (var j in scope.order.dist_orders) {
          var dorder = scope.order.dist_orders[j];

          if (dorder['distributor']['id'] == new_bev_dist_id) {
            dorder['addable_items'].push(new_beverage);
            scope.addItem(dorder, new_beverage);
            break;
          }
        }
      };

      scope.distEmailChanged = function(dorder) {
        var dist = dorder.distributor;
        if (dist===undefined || dist===null) {
          return;
        }
        if (dist.email_edit === '') {
          dist.email_edit = null;
        }

        if (dorder.save_default_email===null && dist.email_edit!==dist.email) {
          dorder.save_default_email = true;
        }
      };

      scope.distPhoneChanged = function(dorder) {
        var dist = dorder.distributor;
        if (dist===undefined || dist===null) {
          return;
        }
        if (dist.phone_edit === '') {
          dist.phone_edit = null;
        }

        if (dorder.save_default_phone===null && dist.phone_edit!==dist.phone) {
          dorder.save_default_phone = true;
        }
      };

      scope.distContactNameChanged = function(dorder) {
        var dist = dorder.distributor;
        if (dist===undefined || dist===null) {
          return;
        }
        if (dist.contact_name_edit === '') {
          dist.contact_name_edit = null;
        }

        if (scope.order['send_method']===scope.send_methods[0]) {
          dorder.save_default_email = true;
          dorder.save_default_phone = false;
        }
        if (scope.order['send_method']===scope.send_methods[1]) {
          dorder.save_default_phone = true;
          dorder.save_default_email = false;
        }
      }


      scope.refreshSelectableDistributors = function() {
        // refresh the selectable distributors list based on which distributors
        // have not yet been added to dist orders
        scope.sel_distributors = [];
        for (var i in scope.all_distributors) {
          var d = scope.all_distributors[i];
          var d_added = false;
          for (var j in scope.order.dist_orders) {
            var dorder = scope.order.dist_orders[j];
            if (dorder.distributor === null) {
              continue;
            }
            if (dorder.distributor.id === d.id) {
              d_added = true;
              break;
            }
          }
          if (!d_added) {
            scope.sel_distributors.push(d);
          }
        }
      }

      scope.selectDistributor = function(dist_order, dist) {

        if (dist === dist_order['distributor']) {
          return;
        }

        dist_order['distributor'] = dist;

        dist_order['addable_items'] = JSON.parse(JSON.stringify(scope.all_bevs));
        dist_order['items'] = [];

        dist_order['delivery_date'] = scope.order['delivery_date'];

        scope.refreshSelectableDistributors();
      };

      scope.deleteDistOrder = function(index) {
        if (scope.order['dist_orders'].length === 1) {
          return;
        }
        if (scope.order['dist_orders'].length <= index) {
          return;
        }
        scope.order['dist_orders'].splice(index,1);
        scope.refreshSelectableDistributors();
      }

      scope.getAllInv = function() {

        $http.get('/inv').
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);
          if (data != null) {
            scope.all_bevs = data;
            ItemsService.processBevsForAddable(scope.all_bevs);

            // process the data we get on the client
            for (var i = 0; i < scope.all_bevs.length; i++) {
              var inv = scope.all_bevs[i];

              // add breweries all_breweries for typeahead convenience when adding 
              // new beverages, which might come from same brewery
              var exists = scope.all_breweries.indexOf(inv['brewery']) >= 0;
              if (!exists) {
                scope.all_breweries.push(inv['brewery']);
              }
            }
          }
          else {
            scope.all_bevs = [];
          }
        }).
        error(function(data, status, headers, config) {

        });
      };
      scope.getAllInv();

      scope.updateDistOrderTotal = function(dorder) {
        dorder.total = 0;
        for ( var i in dorder.items ) {
          var item = dorder.items[i];
          if (!MathService.numIsInvalidOrNegative(item['resolved_subtotal'])) {
            dorder.total += item['resolved_subtotal'];
          }
        }

        scope.updateOrderGrandTotal();
      };

      scope.updateOrderGrandTotal = function() {
        scope.order['grand_total'] = null;
        for (var i in scope.order['dist_orders']) {
          var dorder = scope.order['dist_orders'][i];
          if (scope.order['grand_total']===null) {
            scope.order['grand_total'] = dorder.total;
          } else {
            scope.order['grand_total'] += dorder.total;
          }
        }
      };

      scope.sortDistOrderBevs = function(dorder, sort_str) {
        var double_sort = sort_str === dorder.sort_key;
        if (double_sort) {
          dorder.double_sort *= -1;
        } else {
          dorder.double_sort = -1;
        }
        dorder.sort_key = sort_str;
        var isNum = (sort_str === 'batch_cost' || sort_str === 'par' || sort_str === 'quantity' || sort_str === 'resolved_subtotal');

        dorder.items.sort(function(a, b) {
          var keyA = a[sort_str];
          var keyB = b[sort_str];
          if (dorder.double_sort > 0) {
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

      scope.showAdditionalPricingModal = function(item, dorder) {

        var modalStartInstance = $modal.open({
          templateUrl: 'modalAdditionalPricing.html',
          controller: 'modalAdditionalPricingCtrl',
          windowClass: 'inv-qty-modal',
          backdropClass: 'gray-modal-backdrop',
          size: 'sm',
          backdrop : 'static',
          resolve: {
            item: function() {
              return item;
            }
          }
        });

        modalStartInstance.result.then(
          // success status
          function( result ) {
            // result is a list, first item is string for status, e.g.,
            // 'save' or 'delete'
            // second item is the affected beverage
            var status = result[0];
            var item = result[1];
            
            // after a save, we want to re-calculate cost per mL, for instance
            if (status === 'save') {
              console.log(item);

              // XXX just populate the additional_pricing field of the client
              // object and let the POST of the entire purchase order handle it

            } else if (status === 'remove') {

            }

            scope.updateDistOrderTotal(dorder);
            
          }, 
          // error status
          function() {
            ;
          });
      };

      scope.reviewPDFPurchaseOrders = function(pdf_url, post_order) {
        var modalEditInstance = $modal.open({
          templateUrl: 'reviewPurchaseOrderModal.html',
          controller: 'reviewPurchaseOrderModalCtrl',
          windowClass: 'review-purch-modal',
          backdropClass: 'white-modal-backdrop',
          backdrop : 'static',
          resolve: {
            content_type: function() {
              return "pdf";
            },
            review_obj: function() {
              return pdf_url;
            },
            post_order: function() {
              return post_order;
            },
            read_mode: function() {
              return 'send';
            },
            po_id: function() {
              return null;
            },
            send_later: function() {
              return post_order['order']['send_later'];
            }
          }
        });

        modalEditInstance.result.then(
          // success status
          function( result ) {
            // result is a list, first item is string for status, e.g.,
            // 'save' or 'delete'
            // second item is the send_later status of reviewed po
            var status = result[0];
            var send_later = result[1];
            
            // after a save, we want to show a success dialogue with an optional
            // CC email address
            if (status === 'save') {
              var swal_title = "";
              var swal_content = "";
              if (send_later===true) {
                swal_title = "Saved for Later!";
                swal_content = "Your Purchase Order(s) have been saved in the Pending list, and will be sent to Distributors on the Order Date specified.";
              } else {
                swal_title="Purchase Orders Sent!";
                swal_content="Your Purchase Order(s) were sent to your Distributors!  You can view past orders in the Purchase History page.";
              }
              swal({
                title: swal_title,
                text: swal_content,
                type: "success",
                allowOutsideClick: true,
                html: true});

              // cancel purchase order with force=true to clear the form
              scope.cancelPurchaseOrder(true);

              if (scope.closeOnSave !== null) {
                scope.closeOnSave();
              }

            } else if (status === 'error') {
              swal({
                title: "Error Encountered!",
                text: "There was an error sending your Purchase Orders, please try again later.",
                type: "error",
                allowOutsideClick: true,
                html: true});
            }

          }, 
          // error status
          function() {
            ;
          });
      };

      scope.reviewSMSPurchaseOrders = function(sms_obj, post_order) {
        // sms_obj is an array of objects:
        // [{content, distributor_phone}, {content, distributor_phone}]
        var modalEditInstance = $modal.open({
          templateUrl: 'reviewPurchaseOrderModal.html',
          controller: 'reviewPurchaseOrderModalCtrl',
          windowClass: 'review-purch-modal',
          backdropClass: 'white-modal-backdrop',
          backdrop : 'static',
          resolve: {
            content_type: function() {
              return "sms";
            },
            review_obj: function() {
              return sms_obj;
            },
            post_order: function() {
              return post_order;
            },
            read_mode: function() {
              return 'send';
            },
            po_id: function() {
              return null;
            },
            send_later: function() {
              return post_order['order']['send_later'];
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
            var send_later = result[1];
            
            // after a save, we want to show a success dialogue with an optional
            // CC email address
            if (status === 'save') {
              var swal_title = "";
              var swal_content = "";
              if (send_later===true) {
                swal_title = "Saved for Later!";
                swal_content = "Your Purchase Order(s) have been saved in the Pending list, and will be sent to Distributors on the Order Date specified.";
              } else {
                swal_title="Purchase Orders Sent!";
                swal_content="Your Purchase Order(s) were sent to your Distributors!  You can view past orders in the Purchase History page.";
              }
              swal({
                title: swal_title,
                text: swal_content,
                type: "success",
                allowOutsideClick: true,
                html: true});

              // cancel purchase order with force=true to clear the form
              scope.cancelPurchaseOrder(true);

              if (scope.closeOnSave !== null) {
                scope.closeOnSave();
              }

            } else if (status === 'error') {
              swal({
                title: "Error Encountered!",
                text: "There was an error sending your Purchase Orders, please try again later.",
                type: "error",
                allowOutsideClick: true,
                html: true});
            }

          }, 
          // error status
          function() {
            ;
          });
      };


      scope.reviewSaveOnlyPurchaseOrder = function(po_obj, post_order) {
        // po_obj is a JSON object holding the po info we need to construct
        // an HTML template form of the purchase order for review
        var modalEditInstance = $modal.open({
          templateUrl: 'reviewPurchaseOrderModal.html',
          controller: 'reviewPurchaseOrderModalCtrl',
          windowClass: 'review-purch-modal',
          backdropClass: 'white-modal-backdrop',
          backdrop : 'static',
          resolve: {
            content_type: function() {
              return "html";
            },
            review_obj: function() {
              return po_obj;
            },
            post_order: function() {
              return post_order;
            },
            read_mode: function() {
              return 'send';
            },
            po_id: function() {
              return null;
            },
            send_later: function() {
              return false;
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
            
            // after a save, we want to show a success dialogue with an optional
            // CC email address
            if (status === 'save') {
              swal({
                title: "Purchase Orders Saved!",
                text: "Your Purchase Order(s) was saved in our records!  You can view past orders in the Purchase History page.",
                type: "success",
                allowOutsideClick: true,
                html: true});

              // cancel purchase order with force=true to clear the form
              scope.cancelPurchaseOrder(true);

              if (scope.closeOnSave !== null) {
                scope.closeOnSave();
              }

            } else if (status === 'error') {
              swal({
                title: "Error Encountered!",
                text: "There was an error saving your Purchase Orders, please try again later.",
                type: "error",
                allowOutsideClick: true,
                html: true});
            }

          }, 
          // error status
          function() {
            ;
          });
      };

      scope.reviewAndSave = function() {

        var all_clear = true;
        scope.form_ver.error_order_date = false;
        scope.form_ver.error_contact = false;
        scope.form_ver.error_email = false;
        scope.form_ver.error_phone = false;
        scope.form_ver.error_fax = false;
        scope.form_ver.error_cc = false;
        scope.new_failure_msg = null;
        scope.error_date_msg = null;

        // =========================================================================
        // CHECK BASIC INFO
        // =========================================================================
        // Restaurant Basic Info:
        //   - restaurant contact is not null, at least 2 characters
        //   - restaurant email is not null, valid email
        //   - if phone is not null, phone is valid
        //   - if fax is not null, fax is valid
        if (scope.order['purchase_contact_edit'] === null || scope.order['purchase_contact_edit'].length < 2) {
          scope.form_ver.error_contact = true;
          all_clear = false;
        }
        if (scope.order['purchase_email_edit'] === null || !ContactService.isValidEmail(scope.order['purchase_email_edit'])) {
          scope.form_ver.error_email = true;
          all_clear = false;
        }
        if (scope.order['purchase_phone_edit'] !== null && scope.order['purchase_phone_edit'].length > 0 && !ContactService.isValidPhone(scope.order['purchase_phone_edit'])) {
          scope.form_ver.error_phone = true;
          all_clear = false;
        }
        if (scope.order['purchase_fax_edit'] !== null && scope.order['purchase_fax_edit'].length > 0 && !ContactService.isValidPhone(scope.order['purchase_fax_edit'])) {
          scope.form_ver.error_fax = true;
          all_clear = false;
        }

        if (scope.order['purchase_cc_edit'] !== null && !ContactService.isValidEmail(scope.order['purchase_cc_edit'])) {
          scope.form_ver.error_cc = true;
          all_clear = false;
        }

        // only email option has delivery address, so only need to validate for that
        // send_method
        if (scope.send_method === scope.send_methods[0]) {
          var addressValid = scope.deliveryAddressControl.validateAddress();
          if (addressValid !== true) {
            all_clear = false;
          }
        }

        // =========================================================================
        // CHECK BASIC INFO
        // =========================================================================
        // if order_date is today:
        //   pass, send_later=false
        // if order date is in future date:
        //   pass, send_later=true
        // if order is in past:
        //   if save_only, send_later=false, save it, sent=true
        //   if pdf or sms:
        //     error on Order Date, date is already passed
        var odate = scope.order['order_date'];
        if (odate===null) {
          scope.form_ver.error_order_date = true;
          all_clear = false;
        }

        console.log(odate);
        console.log(new Date());

        if ( DateService.isSameDay(new Date(), odate) ) {
          console.log("SAME DAY");
          // same day, ok!  Send now.
          scope.order['send_later'] = false;
        } else if (DateService.isFutureDay(new Date(), odate)) {
          console.log("FUTURE DAY");
          // future day, ok!  Send later.
          scope.order['send_later'] = true;
        } else {
          console.log("PAST DAY");
          // past day, uh oh.
          if (scope.send_method===scope.send_methods[2]) {
            // just saving, ok!
            scope.order['send_later'] = false;
          } else {
            // can't send in a future date, error
            scope.form_ver.error_order_date = true;
            scope.error_date_msg = "The Order Date you specified is already passed!  We need a future or present date to send your P.O. to your distributors."
            all_clear = false;
          }
        }

        // =========================================================================
        // CHECK DISTRIBUTOR ORDERS
        // =========================================================================
        // Distributor Orders:
        //   - if no distributor selected, just splice and omit
        //   - if no email or email is invalid, error
        //   - if est delivery date invalid, error
        //   - if has no added items, error
        //   - if items missing quantity, error
        //   - if items quantity invalid, error
        //   - if item has 0 quantity, error

        // first remove any dist_orders which don't have a distributor selected
        var valid_dorders = []
        for (var i in scope.order['dist_orders']) {
          var dorder = scope.order.dist_orders[i];
          if (dorder.distributor === null) {
            continue;
          }
          valid_dorders.push(dorder);
        }
        if (valid_dorders.length == 0) {
          scope.order['dist_orders'] = [];
          scope.addEmptyDistributorOrder();
          scope.new_failure_msg = "Please add items to your empty Distributor Orders and try again!";
          return;
        }

        scope.order['dist_orders'] = valid_dorders;

        for (var i in scope.order['dist_orders']) {
          var dorder = scope.order.dist_orders[i];
          dorder.error_dist_email = false;
          dorder.error_dist_phone = false;
          dorder.error_dist_contact_name = false;
          dorder.error_delivery_date = false;
          dorder.error_empty_items = false;

          if (scope.order['send_method']===scope.send_methods[0]) {
            if (dorder.distributor.email_edit === null || !ContactService.isValidEmail(dorder.distributor.email_edit)) {
              all_clear = false;
              dorder.error_dist_email = true;
            }
          }

          if (scope.order['send_method']===scope.send_methods[1]) {
            if (dorder.distributor.phone_edit === null || !ContactService.isValidPhone(dorder.distributor.phone_edit)) {
              all_clear = false;
              dorder.error_dist_phone = true;
            }
          }

          if (dorder.distributor.contact_name_edit!==null && dorder.distributor.contact_name_edit.length > 32) {
            all_clear = false;
            dorder.error_dist_contact_name = true;
          }

          if (dorder.delivery_date === null || !DateService.isValidDate(dorder.delivery_date)) {
            all_clear = false;
            dorder.error_delivery_date = true;
          }

          if (dorder.items === null || dorder.items.length===0) {
            all_clear = false;
            dorder.error_empty_items = true;
            dorder.items = [];
          }

          for (var j in dorder.items) {
            var item = dorder.items[j];
            item.error_quantity = false;
            if (item.quantity === null || MathService.numIsInvalidOrNegative(item.quantity) || item.quantity===0) {
              item.error_quantity = true;
              all_clear = false;
            }
          }
        }

        if (!all_clear) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
          return;
        }

        // POSTING
        // We need to post the following:
        // Order Information:
        //     - order date
        //     - purchase contact
        //     - purchase email
        //     - purchase phone
        //     - purchase fax
        //     - purchase save default
        //     - restautant delivery address type (restaurant or delivery)
        // Distributor Orders
        //     - distributor id
        //     - distributor email
        //     - distributor overwrite default email
        //     - delivery date
        //     - ordered items:
        //         - item id
        //         - item quantity
        //         - item subtotal
        //     - purchase total

        // Basic Order Info --------------------------------------------------------
        scope.post_order = {};
        scope.post_order['order'] = {};
        if (scope.order['order_date_type']===scope.order_date_types[0]) {
          // if posting immediately, we're not posting a *SET* time, so we
          // do not apply the clientTimeToRestaurantTime fix
          scope.post_order['order']['order_date'] = scope.order['order_date'];
        } else {
          scope.post_order['order']['order_date'] = DateService.clientTimeToRestaurantTime(scope.order['order_date']);
        }
        scope.post_order['order']['order_date_pretty'] = scope.order['order_date_pretty'];
        scope.post_order['order']['send_later'] = scope.order['send_later'];
        scope.post_order['order']['purchase_contact'] = scope.order['purchase_contact_edit'];
        scope.post_order['order']['purchase_email'] = scope.order['purchase_email_edit'];
        scope.post_order['order']['purchase_phone'] = scope.order['purchase_phone_edit'];
        scope.post_order['order']['purchase_fax'] = scope.order['purchase_fax_edit'];
        // convert purchase_cc_edit to purchase_cc for posting to server, 
        // which is a list of objects like so: 
        //     [{id:int, email:string}]
        var cc_emails = [];
        if (scope.order['purchase_cc_edit'] !== null) {
          cc_emails = [{'id':null, 'email':scope.order['purchase_cc_edit']}];
        }
        scope.post_order['order']['purchase_cc'] = cc_emails;

        // should server save posted purchase info as default?
        scope.post_order['order']['purchase_save_default'] = (scope.showPurchaseSave===true && scope.defaultContactChecked.value===true);
        if (scope.order['send_method'] === scope.send_methods[0]) {
          scope.post_order['order']['delivery_address_type'] = scope.deliveryAddressControl.getChosenAddressType();
        }
        scope.post_order['order']['send_method'] = null;
        if (scope.order['send_method']===scope.send_methods[0]) {
          scope.post_order['order']['send_method'] = 'email';
        } else if (scope.order['send_method']===scope.send_methods[1]) {
          scope.post_order['order']['send_method'] = 'text';
        } else {
          scope.post_order['order']['send_method'] = 'save';
        }
        // Distributor Orders ------------------------------------------------------
        scope.post_order['dist_orders'] = [];
        for (var i in scope.order['dist_orders']) {
          var copy_dorder = scope.order['dist_orders'][i];
          var dorder = {};
          dorder['distributor'] = copy_dorder['distributor']['name'];
          dorder['distributor_id'] = copy_dorder['distributor']['id'];
          if (scope.order['send_method'] === scope.send_methods[0]) {
            // send via email
            dorder['distributor_email'] = copy_dorder['distributor']['email_edit'];
            dorder['distributor_email_save_default'] = copy_dorder['save_default_email'];
          } else if (scope.order['send_method'] === scope.send_methods[1]) {
            dorder['distributor_phone'] = copy_dorder['distributor']['phone_edit'];
            dorder['distributor_phone_save_default'] = copy_dorder['save_default_phone'];
          }
          // we don't save contact name for save only
          if (scope.order['send_method']!==scope.send_methods[2]) {
            dorder['distributor_contact_name'] = copy_dorder['distributor']['contact_name_edit'];
          }
          
          dorder['delivery_date'] = DateService.clientTimeToRestaurantTime(copy_dorder['delivery_date']);
          dorder['total'] = copy_dorder['total'];
          dorder['additional_notes'] = copy_dorder['additional_notes'];
          if (dorder['additional_notes']==='' || dorder['additional_notes']===' ') {
            dorder['additional_notes'] = null;
          }
          // handle items in distributor order
          dorder['items'] = [];
          for (var j in copy_dorder['items']) {
            var copy_item = copy_dorder['items'][j];
            var ditem = {};
            ditem['beverage_id'] = copy_item['id'];
            ditem['quantity'] = parseFloat(copy_item['quantity']);
            ditem['batch_cost'] = copy_item['batch_cost'];
            ditem['subtotal'] = copy_item['subtotal'];
            ditem['resolved_subtotal'] = copy_item['resolved_subtotal'];
            ditem['additional_pricing'] = copy_item['additional_pricing'];
            ditem['additional_pricing_description'] = copy_item['additional_pricing_description'];
            dorder['items'].push(ditem);
          }
          scope.post_order['dist_orders'].push(dorder);
        }

        console.log(scope.post_order);

        $http.post('/purchase', {
          order: scope.post_order['order'],
          distributor_orders: scope.post_order['dist_orders'],
          do_send: false // we just want documents back for review, not to commit sending yet
        }).
        success(function(data, status, headers, config) {
          console.log(data);
          // we pass post_order to these review methods just so we can
          // repost to server once user confirms
          if (scope.order['send_method']===scope.send_methods[0]) {
            var URL = data['url'];
            scope.reviewPDFPurchaseOrders(URL, scope.post_order); 
          } else if (scope.order['send_method']===scope.send_methods[1]) {
            scope.reviewSMSPurchaseOrders(data, scope.post_order); 
          } else {
            var purchase_order = data;
            ItemsService.processPurchaseOrders([purchase_order]);
            scope.reviewSaveOnlyPurchaseOrder(purchase_order, scope.post_order)
          }
               
        }).
        error(function(data, status, headers, config) {

        });
        
      }
    }
  }
})

.controller('modalAdditionalPricingCtrl', function($scope, $modalInstance, $modal, ItemsService, MathService, item) {

  $scope.item = item;

  console.log('additional pricing');
  console.log($scope.item);

  $scope.apply_to_types = ["Subtotal"];
  $scope.purchase_unit = ItemsService.getPOUnitName($scope.item.container_type, $scope.item.purchase_count);
  $scope.apply_to_types.push("Each individual " + $scope.purchase_unit);
  
  $scope.apply_to = {'value':null};

  $scope.modify_types = ["($) Amount", "(%) Percent Discount"];
  $scope.modify = {'value':null};

  $scope.notes = {'value':null};

  // if modify is +/- amount, add_sign is - or +
  $scope.add_sign = {'value':'-'}; // default to minus
  $scope.add_value = {'value': null};
  $scope.mult_value = {'value': null};

  $scope.effect_string = null;    // long effect string for display in modal
  $scope.effect_string_short = null; // short for display in distributor order
  $scope.new_subtotal = $scope.item['subtotal'];
  $scope.show_delete_btn = false;

  $scope.recalculateSubtotal = function() {

    var add_sign = 1;
    if ($scope.add_sign.value === '-') {
      add_sign = -1
    }

    var purchase_cost = $scope.item['purchase_cost'];
    var deposit = $scope.item['deposit'];
    if (deposit === null) {
      deposit = 0;
    }

    // if modifying amount
    if ($scope.modify.value === $scope.modify_types[0]) {

      // if add value is invalid, reset and quit
      if ($scope.add_value.value === null || MathService.numIsInvalidOrNegative($scope.add_value.value)) {
        $scope.new_subtotal = $scope.item['subtotal'];
        $scope.effect_string = null;
        $scope.effect_string_short = null;
        return;
      }

      if ($scope.apply_to.value === $scope.apply_to_types[0]) {
        // applying to subtotal
        $scope.new_subtotal = $scope.item['subtotal'] + (add_sign * $scope.add_value.value);
        if (add_sign > 0) {
          $scope.effect_string = "Add $" + MathService.fixFloat2($scope.add_value.value) + " to subtotal.";
          $scope.effect_string_short = "+ $" + MathService.fixFloat2($scope.add_value.value) + " subtotal";
        } else {
          $scope.effect_string = "Subtract $" + MathService.fixFloat2($scope.add_value.value) + " from subtotal.";
          $scope.effect_string_short = "- $" + MathService.fixFloat2($scope.add_value.value) + " subtotal";
        }
      } else {
        // applying to individual items
        // note, discounts do not apply to any deposits, so need to separate
        // batch_cost into wholesale and deposit, and apply discount to 
        // deposit only

        purchase_cost += add_sign * $scope.add_value.value;
        if (purchase_cost < 0) {
          purchase_cost = 0;
        }
        var batch_cost = purchase_cost + deposit;
        $scope.new_subtotal = MathService.fixFloat2( batch_cost * $scope.item['quantity'] );

        if (add_sign > 0) {
          $scope.effect_string = "Add $" + MathService.fixFloat2($scope.add_value.value) + " to each " + $scope.purchase_unit + ".";
          $scope.effect_string_short = "+ $" + MathService.fixFloat2($scope.add_value.value) + " /unit";
        } else {
          $scope.effect_string = "Subtract $" + MathService.fixFloat2($scope.add_value.value) + " from each " + $scope.purchase_unit + ".";
          $scope.effect_string_short = "- $" + MathService.fixFloat2($scope.add_value.value) + " /unit";
        }

      }
    }
    // if modifying percentage
    else {

      if ($scope.mult_value.value === null || MathService.numIsInvalid($scope.mult_value.value)) {
        $scope.new_subtotal = $scope.item['subtotal'];
        $scope.effect_string = null;
        $scope.effect_string_short = null;
        return;
      }

      // percent discounts apply only to individual items
      // note, discounts do not apply to any deposits, so need to separate
      // batch_cost into wholesale and deposit, and apply discount to 
      // deposit only
      var factor = 1.0 - parseFloat($scope.mult_value.value) / 100.0;
      purchase_cost *= factor;
      var batch_cost = purchase_cost + deposit;
      $scope.new_subtotal = MathService.fixFloat2( batch_cost * item['quantity'] );
      $scope.effect_string = "Apply " + MathService.fixFloat2($scope.mult_value.value) + "% discount to each " + $scope.purchase_unit + ".";
      $scope.effect_string_short = MathService.fixFloat2($scope.mult_value.value) + "% discount";
    }

    if ($scope.new_subtotal < 0) {
      $scope.new_subtotal = 0;
    }

  };

  // load existing params, if applicable
  $scope.initPricingState = function() {

    $scope.modify.value = $scope.modify_types[0];
    $scope.apply_to.value = $scope.apply_to_types[0];
    
    if ($scope.item['additional_pricing']===null || $scope.item['additional_pricing']===undefined || $scope.item['additional_pricing'].length===0) {
      $scope.item['resolved_subtotal'] = $scope.item['subtotal'];
    } else {
      $scope.show_delete_btn = true;
      
      var lead_char = $scope.item['additional_pricing'][0];
      var trailing = $scope.item['additional_pricing'].substring(1);
      console.log('trailing:');
      console.log(trailing);

      // if start with + or -, modify is amount
      if (lead_char==='+' || lead_char==='-') {
        $scope.modify.value = $scope.modify_types[0];
        var tokens = trailing.split('|');
        var value = tokens[0];
        var type = tokens[1];

        $scope.add_sign.value = lead_char;
        $scope.add_value.value = MathService.fixFloat2(parseFloat(value));
        $scope.notes.value = $scope.item['additional_pricing_description'];
        if (type==='unit') {
          $scope.apply_to.value = $scope.apply_to_types[1];
        } else {
          $scope.apply_to.value = $scope.apply_to_types[0];
        }
        $scope.recalculateSubtotal();

      }
      // if start with *, modify is percent
      else if (lead_char==='*') {
        $scope.modify.value = $scope.modify_types[1];
        var value = trailing;
        $scope.mult_value.value = MathService.fixFloat2(parseFloat(value));
        $scope.notes.value = $scope.item['additional_pricing_description'];
        $scope.recalculateSubtotal();
      }
      // else it's malformed, start with blank state
      else {
        ;
      }

    }
  };
  $scope.initPricingState();
  
  $scope.save = function() {

    $scope.new_failure_msg = null;
    $scope.form_ver = {
      'error_add_value': null,
      'error_mult_value': null
    }
    
    var all_clear = true;

    // XXX check form verification
    // if adding, scope.add_value must be valid
    if ($scope.modify.value === $scope.modify_types[0]) {
      if ($scope.add_value.value === null || MathService.numIsInvalidOrNegative($scope.add_value.value)) {
        $scope.form_ver.error_add_value = true;
        all_clear = false;
      }
    } else {
      if ($scope.mult_value.value === null || MathService.numIsInvalid($scope.mult_value.value)) {
        $scope.form_ver.error_mult_value = true;
        all_clear = false;
      }
    }

    if (!all_clear) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
      return;
    }

    //$scope.item.additional_pricing = '';

    var add_str = '';
    // Save the pricing rule into item.additional_pricing
    // Format is as follows:
    //   If applying amount discount:
    //     +5.5|subtotal, -20|subtotal, +15|unit, -7|unit, etc.
    //   If applying percent discount:
    //     *25 for 25% discount per unit, *0.1 for 10% discount per unit
    if ($scope.modify.value === $scope.modify_types[0]) {
      add_str = $scope.add_sign.value;
      add_str += MathService.fixFloat2($scope.add_value.value);
      add_str += '|';
      if ($scope.apply_to.value === $scope.apply_to_types[0]) {
        add_str += 'subtotal';
      } else {
        add_str += 'unit';
      }
    } else {
      add_str = '*';
      add_str += MathService.fixFloat2($scope.mult_value.value);
    }

    $scope.item['additional_pricing'] = add_str;
    if ($scope.notes.value==='') {
      $scope.notes.value = null;
    }
    $scope.item['additional_pricing_description'] = $scope.notes.value;
    $scope.item['additional_pricing_short'] = $scope.effect_string_short;
    $scope.item['resolved_subtotal'] = $scope.new_subtotal;

    $modalInstance.close(['save', $scope.item]);
    
  };

  $scope.remove = function() {

    swal({
      title: "Remove Pricing Rule?",
      text: "Are you sure you want to remove this pricing adjustment?",
      type: "warning",
      showCancelButton: true,
      html: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $scope.item['additional_pricing'] = null;
        $scope.item['additional_pricing_description'] = null;
        $scope.item['additional_pricing_short'] = null;
        $scope.item['resolved_subtotal'] = $scope.item['subtotal'];
        $modalInstance.close(['remove', $scope.item]);
        
    });
    
  }

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

});
