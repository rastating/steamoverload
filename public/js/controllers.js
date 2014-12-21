var controllers = angular.module('controllers', []);

controllers.controller('PanelDemoCtrl', function ($scope, $http) {
    $http.get('/test/panels').success(function (data) {
        $scope.default = data;
    });
});

controllers.controller('NavigationCtrl', function ($scope, $http) {
    $http.get('/api/navigation/').success(function (data) {
        $scope.links = data.links;
    });
});