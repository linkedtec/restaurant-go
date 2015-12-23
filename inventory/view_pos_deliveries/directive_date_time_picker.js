angular.module('myApp')

.directive('dateTimePicker', function($http) {
  return {
    restrict: 'AE',
    scope: {
      blueTitle: '=',
      pickedTime: '=',
      pickedDate: '=',
      control: '=',
      title:'=',
      formVerDate:'='
    },
    templateUrl: './view_pos_deliveries/template_date_time_picker.html',
    link: function(scope, elem, attrs) {

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};

      scope.form_error_msg = null;

      scope.internalControl.clearState = function() {
        scope.form_error_msg = null;
      };

      scope.internalControl.resetTime = function() {
        scope.pickedTime = new Date();
        scope.pickedTime.setMinutes(
          parseInt(scope.pickedTime.getMinutes() / 5) * 5);
        scope.pickedDate = new Date();
      };
      if (scope.pickedDate===null || scope.pickedDate===undefined || scope.pickedTime===null || scope.pickedTime===undefined) {
        scope.internalControl.resetTime();
      }

      // rename dt to pickedDate
      //=====================================
      // Date picker
      scope.minDate = null;
      scope.date_opened = false;

      scope.formats = ['EEE MMMM dd yyyy', 'yyyy/MM/dd', 'dd.MM.yyyy', 'shortDate'];
      scope.format = scope.formats[0];

      scope.today = function() {
        var today = new Date();
        scope.pickedDate = new Date();
        scope.today = today;
      };
      //scope.today();

      scope.clearDate = function () {
        scope.pickedDate = null;
      };

      scope.toggleMin = function() {
        //scope.minDate = scope.minDate ? null : new Date();
      };
      //scope.toggleMin();

      scope.openDate = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        scope.date_opened = !scope.date_opened;
      };

      scope.dateOptions = {
        formatYear: 'yy',
        startingDay: 1,
        showWeeks:false
      };

      scope.getDayClass = function(date, mode) {
        if (mode === 'day') {
          var dayToCheck = new Date(date).setHours(0,0,0,0);

          for (var i=0;i<scope.events.length;i++){
            var currentDay = new Date(scope.events[i].date).setHours(0,0,0,0);

            if (dayToCheck === currentDay) {
              return scope.events[i].status;
            }
          }
        }

        return '';
      };

      //=====================================
      // Time picker
      //scope.pickedTime = new Date();
      //scope.pickedTime.setMinutes(
      //  parseInt(scope.pickedTime.getMinutes() / 5) * 5);

      scope.hstep = 1;
      scope.mstep = 5;

      scope.ismeridian = true;
      scope.toggleMode = function() {
        scope.ismeridian = !scope.ismeridian;
      };

      scope.update = function() {
        var d = new Date();
        d.setHours( 14,0,0,0 );
        scope.pickedTime = d;
      };

      scope.timeChanged = function () {
      };

      scope.clearTime = function() {
        scope.pickedTime = null;
      };
    }
  }
});