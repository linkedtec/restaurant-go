angular.module('myApp')

.directive('createPurchaseOrder', function($modal, $http, ContactService, DateService, DistributorsService, ItemsService, MathService) {
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

      scope.order_date_types = ['Immediately', 'A Future Date'];
      scope.send_methods = ['Send via Email', 'Send via Text', "Save & Don't Send"];

      scope.order = {};
      scope.order['restaurant_name'] = null;
      scope.order['purchase_contact'] = null;
      scope.order['purchase_email'] = null;
      scope.order['purchase_phone'] = null;
      scope.order['purchase_fax'] = null;
      scope.order['po_num'] = null;
      scope.order['send_later'] = false;
      scope.showPurchaseSave = false;
      scope.defaultContactChecked = true;
      // the global delivery date which will be applied to dorders at start
      scope.order['delivery_date'] = null;
      scope.order['dist_orders'] = [];
      scope.order['order_date'] = null;
      scope.order['order_date_type'] = scope.order_date_types[0];
      scope.order['order_date_pretty'] = null;
      //scope.order['order_date_pretty'] = DateService.getPrettyDate((new Date()).toString(), false, true);
      scope.order['send_method'] = null;
      scope.deliveryAddressControl = {};

      scope.form_ver = {};
      scope.new_failure_msg = null;
      scope.error_date_msg = null;

      scope.note_char_limit = 140;

      scope.showAutoHelp = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        swal({
          title: "Test!",
          text: "hi.",
          type: "success",
          timer: 4000,
          allowOutsideClick: true,
          html: true});
      };

      scope.getRestaurant = function() {
        $http.get('/restaurant/name').
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

      scope.addEmptyDistributorOrder = function() {
        scope.order['dist_orders'].push({
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
          double_sort: -1});
      };

      scope.addAutoDistributorOrder = function(dist_id, items) {

        var new_dorder = {
          distributor:null, 
          delivery_date: scope.order['delivery_date'], 
          addable_items: [],
          items:[],
          total:null,
          show_add_ui:false,
          addableControl: {},
          sort_key: null,
          additional_notes: null,
          save_default_email: null,
          save_default_phone: null,
          double_sort: -1
        };

        for (var i in scope.all_distributors) {
          var dist = scope.all_distributors[i];
          if (dist['id'] === dist_id) {
            scope.selectDistributor(new_dorder, dist);
            break;
          }
        }

        // for each of the items in @items, find the corresponding addable bev
        // from scope.all_bevs, and add it to this dorder using scope.addItem,
        // and automatically resolve its par using scope.matchQuantityToPar
        for (var i in items) {
          var id_bev = items[i];
          var bev = null;
          for (var j in scope.all_bevs) {
            var check_bev = scope.all_bevs[j];
            if (id_bev['version_id'] === check_bev['version_id']) {
              bev = check_bev;
              break;
            }
          }
          if (bev !== null) {
            
            scope.addItem(new_dorder, bev);
            scope.matchQuantityToPar(bev, new_dorder);
          }
        }

        scope.order['dist_orders'].push(new_dorder);
      }

      scope.initDistOrders = function() {
        scope.order['dist_orders'] = [];
        scope.addEmptyDistributorOrder();
      };

      scope.initManualForm = function() {
        scope.new_failure_msg = null;
        scope.getAllDistributors();
        scope.initDistOrders();
        scope.refreshSelectableDistributors();

        console.log(scope.order['dist_orders']);
        scope.getRestaurant();
        scope.getPONum();

      };

      scope.initAutoForm = function() {
        scope.new_failure_msg = null;
        scope.order['dist_orders'] = [];
        scope.getAllDistributors(true);
        // getAllDistributors will call getAutoPurchaseOrder after it's done
        scope.refreshSelectableDistributors();

        scope.getRestaurant();
        scope.getPONum();

      };

      scope.getPONum = function() {
        // get the next available unique id for this purchase order
        $http.get('/purchase/ponum').
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
                scope.addAutoDistributorOrder(dist_order['distributor_id'], dist_order.items);
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

        // if mode is 0 we are resetting everything
        if (mode === 0) {
          scope.order['delivery_date'] = null;
          scope.order['order_date'] = null;
          scope.order['order_date_type'] = scope.order_date_types[0];
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
          }
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

        if (scope.order['purchase_contact'] !== scope.order['purchase_contact_edit'] ||
          scope.order['purchase_email'] !== scope.order['purchase_email_edit'] ||
          scope.order['purchase_phone'] !== scope.order['purchase_phone_edit'] || 
          scope.order['purchase_fax'] !== scope.order['purchase_fax_edit']) {
          scope.showPurchaseSave = true;
        } else {
          console.log("NO CHANGE");
          scope.showPurchaseSave = false
        }
      };

      scope.showAddInv = function(dist_order) {
        dist_order.show_add_ui = true;
      };

      scope.hideAddInv = function(dist_order) {
        dist_order.show_add_ui = false;
      };

      scope.addItem = function(dist_order, item) {
        console.log(item);

        item['quantity'] = null;

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
              item['quantity'] = null;
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
          return;
        }

        console.log('quantity is ' + item['quantity']);
        if (MathService.numIsInvalid(item['quantity'])) {
          item['subtotal'] = null;
          return;
        }

        item['subtotal'] = item['batch_cost'] * item['quantity'];

        scope.updateDistOrderTotal(dorder);
      };


      scope.matchQuantityToPar = function(item, dorder) {
        if (item['count_recent']===null || item['par']===null) {
          return;
        }
        var diff = item['par'] - item['count_recent'];
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

      scope.getAllDistributors = function( doAuto ) {

        scope.all_distributors = [];

        var result = DistributorsService.get();
        result.then(function(payload) {
          var data = payload.data;
          
          for (var i in data) {
            var dist = data[i];
            dist['email_edit'] = dist['email'];
            dist['phone_edit'] = dist['phone'];
            scope.all_distributors.push(dist);
            scope.sel_distributors.push(dist);
          }

          if (doAuto === true) {
            scope.getAutoPurchaseOrder();
          }

          console.log(data);
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };
      //scope.getAllDistributors();

      scope.distEmailChanged = function(dorder) {
        var dist = dorder.distributor;
        if (dist===undefined || dist===null) {
          return;
        }
        if (dist.email_edit === '') {
          dist.email_edit = null;
        }

        if (dorder.save_default_email===null && dist.email_edit !==dist.email) {
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

        if (dorder.save_default_phone===null && dist.phone_edit !==dist.phone) {
          dorder.save_default_phone = true;
        }
      };


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
          if (!MathService.numIsInvalid(item['quantity'])) {
            dorder.total += item['batch_cost'] * item['quantity'];
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
        var isNum = (sort_str === 'batch_cost' || sort_str === 'par' || sort_str === 'quantity' || sort_str === 'subtotal');

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
          scope.initDistOrders();
          scope.new_failure_msg = "Please add items to your empty Distributor Orders and try again!";
          return;
        }

        scope.order['dist_orders'] = valid_dorders;

        for (var i in scope.order['dist_orders']) {
          var dorder = scope.order.dist_orders[i];
          dorder.error_dist_email = false;
          dorder.error_dist_phone = false;
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
            if (item.quantity === null || MathService.numIsInvalid(item.quantity) || item.quantity===0) {
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
        // should server save posted purchase info as default?
        scope.post_order['order']['purchase_save_default'] = (scope.showPurchaseSave===true && scope.defaultContactChecked===true);
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
});