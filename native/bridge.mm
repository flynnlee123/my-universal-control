#include <napi.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

// ===========================
// 原有功能保持不变
// ===========================

Napi::Value MoveMouseAbs(const Napi::CallbackInfo& info) {
    double x = info[0].As<Napi::Number>().DoubleValue();
    double y = info[1].As<Napi::Number>().DoubleValue();
    CGPoint newPos = CGPointMake(x, y);
    CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, newPos, kCGMouseButtonLeft);
    CGEventPost(kCGHIDEventTap, move);
    CFRelease(move);
    return info.Env().Null();
}

Napi::Value ClickMouse(const Napi::CallbackInfo& info) {
    int btnCode = info[0].As<Napi::Number>().Int32Value(); 
    bool isDown = info[1].As<Napi::Boolean>().Value();
    int clickCount = info[2].As<Napi::Number>().Int32Value();
    
    CGMouseButton btn = kCGMouseButtonLeft;
    CGEventType type = isDown ? kCGEventLeftMouseDown : kCGEventLeftMouseUp;
    
    if (btnCode == 2) {
        btn = kCGMouseButtonRight;
        type = isDown ? kCGEventRightMouseDown : kCGEventRightMouseUp;
    } else if (btnCode == 3) {
        btn = kCGMouseButtonCenter;
        type = isDown ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
    }
    
    CGEventRef event = CGEventCreate(NULL);
    CGPoint pos = CGEventGetLocation(event);
    CFRelease(event);
    
    CGEventRef click = CGEventCreateMouseEvent(NULL, type, pos, btn);
    CGEventSetIntegerValueField(click, kCGMouseEventClickState, clickCount);
    CGEventPost(kCGHIDEventTap, click);
    CFRelease(click);
    return info.Env().Null();
}

Napi::Value KeyEvent(const Napi::CallbackInfo& info) {
    int keyCode = info[0].As<Napi::Number>().Int32Value();
    bool isDown = info[1].As<Napi::Boolean>().Value();
    CGEventRef key = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)keyCode, isDown);
    CGEventPost(kCGHIDEventTap, key);
    CFRelease(key);
    return info.Env().Null();
}

Napi::Value ScrollEvent(const Napi::CallbackInfo& info) {
    int dy = info[0].As<Napi::Number>().Int32Value();
    int dx = info[1].As<Napi::Number>().Int32Value();
    CGEventRef scroll = CGEventCreateScrollWheelEvent2(NULL, kCGScrollEventUnitPixel, 2, dy, dx, 0);
    CGEventSetIntegerValueField(scroll, kCGScrollWheelEventIsContinuous, 1);
    CGEventPost(kCGHIDEventTap, scroll);
    CFRelease(scroll);
    return info.Env().Null();
}

Napi::Value WarpMouse(const Napi::CallbackInfo& info) {
    double x = info[0].As<Napi::Number>().DoubleValue();
    double y = info[1].As<Napi::Number>().DoubleValue();
    CGPoint newPos = CGPointMake(x, y);
    CGWarpMouseCursorPosition(newPos);
    return info.Env().Null();
}

Napi::Value SetCursor(const Napi::CallbackInfo& info) {
    bool visible = info[0].As<Napi::Boolean>().Value();
    CGDisplayCount displayCount;
    CGGetActiveDisplayList(0, NULL, &displayCount);
    CGDirectDisplayID *displays = (CGDirectDisplayID *)malloc(displayCount * sizeof(CGDirectDisplayID));
    CGGetActiveDisplayList(displayCount, displays, &displayCount);
    for (CGDisplayCount i = 0; i < displayCount; i++) {
        if (visible) {
            CGDisplayShowCursor(displays[i]);
        } else {
            CGDisplayHideCursor(displays[i]);
        }
    }
    free(displays);
    return info.Env().Null();
}

Napi::Value CheckAuth(const Napi::CallbackInfo& info) {
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    bool trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    return Napi::Boolean::New(info.Env(), trusted);
}

// ===========================
// 新增功能：光标锁定与事件拦截
// ===========================

// 1. 鼠标锁定 (冻结系统光标位置，但允许读取 Delta)
Napi::Value SetMouseLock(const Napi::CallbackInfo& info) {
    bool locked = info[0].As<Napi::Boolean>().Value();
    // false = 解除关联(锁定光标), true = 恢复关联
    CGAssociateMouseAndMouseCursorPosition(!locked);
    return info.Env().Null();
}

// 2. 获取鼠标 Delta (自上次调用以来的移动量)
Napi::Value GetMouseDelta(const Napi::CallbackInfo& info) {
    int dx, dy;
    CGGetLastMouseDelta(&dx, &dy);
    
    Napi::Object result = Napi::Object::New(info.Env());
    result.Set("x", Napi::Number::New(info.Env(), dx));
    result.Set("y", Napi::Number::New(info.Env(), dy));
    return result;
}

// 3. 点击拦截器 (Trap)
static CFMachPortRef clickTrapPort = NULL;
static CFRunLoopSourceRef clickTrapSource = NULL;

CGEventRef ClickTrapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    // 拦截所有点击事件，返回 NULL 吞噬掉
    // 这样 uIOhook (HID level) 能收到，但系统窗口 (Session level) 收不到
    return NULL;
}

Napi::Value SetClickTrap(const Napi::CallbackInfo& info) {
    bool enable = info[0].As<Napi::Boolean>().Value();
    
    if (enable) {
        if (!clickTrapPort) {
            CGEventMask mask = CGEventMaskBit(kCGEventLeftMouseDown) |
                               CGEventMaskBit(kCGEventLeftMouseUp) |
                               CGEventMaskBit(kCGEventRightMouseDown) |
                               CGEventMaskBit(kCGEventRightMouseUp) |
                               CGEventMaskBit(kCGEventOtherMouseDown) |
                               CGEventMaskBit(kCGEventOtherMouseUp);
            
            // 使用 Session Tap，优先级低于 HID (uIOhook)，高于 App
            clickTrapPort = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask, ClickTrapCallback, NULL);
            
            if (clickTrapPort) {
                clickTrapSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, clickTrapPort, 0);
                CFRunLoopAddSource(CFRunLoopGetMain(), clickTrapSource, kCFRunLoopCommonModes);
                CGEventTapEnable(clickTrapPort, true);
            }
        }
    } else {
        if (clickTrapPort) {
            CGEventTapEnable(clickTrapPort, false);
            CFRunLoopRemoveSource(CFRunLoopGetMain(), clickTrapSource, kCFRunLoopCommonModes);
            CFRelease(clickTrapSource);
            CFRelease(clickTrapPort);
            clickTrapPort = NULL;
            clickTrapSource = NULL;
        }
    }
    return info.Env().Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("moveMouseAbs", Napi::Function::New(env, MoveMouseAbs));
    exports.Set("clickMouse", Napi::Function::New(env, ClickMouse));
    exports.Set("keyEvent", Napi::Function::New(env, KeyEvent));
    exports.Set("scrollEvent", Napi::Function::New(env, ScrollEvent));
    exports.Set("warpMouse", Napi::Function::New(env, WarpMouse));
    exports.Set("setCursor", Napi::Function::New(env, SetCursor));
    exports.Set("checkAuth", Napi::Function::New(env, CheckAuth));
    // 新增 API
    exports.Set("setMouseLock", Napi::Function::New(env, SetMouseLock));
    exports.Set("getMouseDelta", Napi::Function::New(env, GetMouseDelta));
    exports.Set("setClickTrap", Napi::Function::New(env, SetClickTrap));
    return exports;
}

NODE_API_MODULE(bridge, Init)