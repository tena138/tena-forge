import 'session_store.dart';
import 'session_store_secure.dart'
    if (dart.library.html) 'session_store_web.dart';

SessionStore createPlatformSessionStore() => PlatformSessionStore();
