angular.module('myApp')

.factory("DeliveriesService", function($http, DateService) {

  return {
    get: function(start_date, end_date, xport, email) {
      var params = { 
        start_date: DateService.clientTimeToRestaurantTime(start_date),
        end_date: DateService.clientTimeToRestaurantTime(end_date),
        email: email
      };
      if (xport!==null) {
        params['export'] = xport;
      }
      var promise = $http.get('/deliveries', {
        params: params });
      return promise;
    },

    post: function(new_delivery) {
      var promise = $http.post(
        '/deliveries', 
        new_delivery);

      return promise;
    },

    put: function(edit_delivery, change_keys) {
      var promise = $http.put('/deliveries', {
        delivery:edit_delivery,
        change_keys:change_keys
      });
      return promise;
    },

    delete: function(delivery_id) {
      var promise = $http.delete('/deliveries', {
        params: {
          id:delivery_id
        }
      });
      
      return promise;
    }
  };

})