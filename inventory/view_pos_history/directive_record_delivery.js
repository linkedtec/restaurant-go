angular.module('myApp')

.directive('recordDelivery', function($modal, $http, $timeout, MathService, DateService, DeliveriesService, ItemsService) {
  return {
    restrict: 'AE',
    scope: {
      distOrder: '=',   // if we're using this to edit instead of create new beverage
      closeOnSave: '&',
      closeOnCancel: '&',
      closeOnDelete: '&',
      control: '='
    },
    templateUrl: './view_pos_history/template_record_delivery.html',
    link: function(scope, elem, attrs) {

      scope.invoice = null;

      scope.internalControl = scope.control || {};
      
      scope.delivery_time = null;
      scope.delivery_date = null;

      console.log(scope.distOrder);

    }
  }
});