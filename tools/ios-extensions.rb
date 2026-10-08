# Adds Waypage's two app extensions to the generated iOS project (1.6.0):
# the share extension (Waypage in the share sheet) and the widgets. From
# LifeLog's tools/ios-widgets.rb.
#
#   ruby tools/ios-extensions.rb
#
# `npx cap add ios` makes a project with one target, the app. Each extension
# is another, built from its folder in native/share/ios plus
# Shared/WaypageShared.swift, which the app's plugins compile too: referenced
# where they are, not copied, so the repo holds one copy. Both are embedded
# in the app, share an App Group with it, and carry the app's version, as iOS
# requires of an extension.
#
# The share extension is built without APPLICATION_EXTENSION_API_ONLY: it
# opens the app through the responder chain's UIApplication, which that
# setting forbids (ShareViewController.swift says why).
#
# Run after tools/ios-project.js (it reads the version that stamps) and
# before `npx cap sync ios` (pod install then adds its build phases after
# ours; the other way round is the build-cycle error Xcode is known for).
# Uses the xcodeproj gem, which is CocoaPods' own. Idempotent.
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT = File.join(ROOT, 'ios', 'App', 'App.xcodeproj')
# From ios/App, where the project's paths start.
SRC = '../../native/share/ios'
EXTENSIONS = [
  { name: 'WaypageShareExtension', id: 'io.github.danielnoam.waypage.share', dir: 'ShareExtension',
    sources: %w[ShareExtension/ShareViewController.swift], entitlements: 'ShareExtension/WaypageShare.entitlements',
    min_ios: '15.5', api_only: 'NO' },
  # containerBackground, which a widget needs from iOS 17 on, is iOS 17.
  { name: 'WaypageWidgets', id: 'io.github.danielnoam.waypage.widgets', dir: 'Widgets',
    sources: %w[Widgets/WaypageWidgets.swift], entitlements: 'Widgets/WaypageWidgets.entitlements',
    min_ios: '17.0', api_only: 'YES' },
].freeze

project = Xcodeproj::Project.open(PROJECT)
app = project.targets.find { |t| t.name == 'App' } or abort('ios: no App target')
app_settings = app.build_configurations.first.build_settings
group = project.main_group.find_subpath('Waypage', false) || project.main_group.new_group('Waypage', SRC)
shared = group.files.find { |f| f.path == 'Shared/WaypageShared.swift' } || group.new_file('Shared/WaypageShared.swift')

embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' }
unless embed
  embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
  # Straight after Resources, ahead of any script phase.
  phases = app.build_phases
  phases.delete(embed)
  at = phases.index { |p| p.is_a?(Xcodeproj::Project::Object::PBXResourcesBuildPhase) }
  phases.insert(at ? at + 1 : phases.length, embed)
end

added = []
EXTENSIONS.each do |e|
  next if project.targets.any? { |t| t.name == e[:name] }
  ext = project.new_target(:app_extension, e[:name], :ios, e[:min_ios])
  ext.add_file_references(e[:sources].map { |f| group.new_file(f) } + [shared])
  group.new_file("#{e[:dir]}/Info.plist")
  group.new_file(e[:entitlements])
  ext.build_configurations.each do |c|
    s = c.build_settings
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['PRODUCT_BUNDLE_IDENTIFIER'] = e[:id]
    s['INFOPLIST_FILE'] = "#{SRC}/#{e[:dir]}/Info.plist"
    s['GENERATE_INFOPLIST_FILE'] = 'NO'
    s['CODE_SIGN_ENTITLEMENTS'] = "#{SRC}/#{e[:entitlements]}"
    s['SWIFT_VERSION'] = '5.0'
    s['IPHONEOS_DEPLOYMENT_TARGET'] = e[:min_ios]
    s['TARGETED_DEVICE_FAMILY'] = '1,2'
    s['SKIP_INSTALL'] = 'YES'
    s['APPLICATION_EXTENSION_API_ONLY'] = e[:api_only]
    s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
    s['MARKETING_VERSION'] = app_settings['MARKETING_VERSION']
    s['CURRENT_PROJECT_VERSION'] = app_settings['CURRENT_PROJECT_VERSION']
  end
  # Built before the app, and copied into its PlugIns folder.
  app.add_dependency(ext)
  embed.add_file_reference(ext.product_reference, true).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  added << "#{e[:name]} (#{e[:id]}, iOS #{e[:min_ios]}+)"
end

group.new_file('App.entitlements') unless group.files.any? { |f| f.path == 'App.entitlements' }
app.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = "#{SRC}/App.entitlements"
end

project.save
puts added.empty? ? 'ios: the extensions are already in the project' : "ios: added #{added.join(' and ')}, embedded in the app"
