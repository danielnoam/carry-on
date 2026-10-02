require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CarryonShare'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Private', :text => 'Part of Carry-on.' }
  s.homepage = 'https://github.com/danielnoam/carry-on'
  s.author = 'Carry-on'
  s.source = { :git => 'https://github.com/danielnoam/carry-on.git' }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
