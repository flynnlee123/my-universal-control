#include <napi.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

// 1. 模拟鼠标移动 (接收 Delta - 相对移动)
Napi::Value MoveMouse(const Napi::CallbackInfo& info) {
    double dx = info[0].As<Napi::Number>().DoubleValue();
    double dy = info[1].As<Napi::Number>().DoubleValue();

    CGEventRef event = CGEventCreate(NULL);
    CGPoint current = CGEventGetLocation(event);
    CFRelease(event);

    CGPoint newPos = CGPointMake(current.x + dx, current.y + dy);
    
    CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, newPos, kCGMouseButtonLeft);
    CGEventPost(kCGHIDEventTap, move);
    CFRelease(move);
    return info.Env().Null();
}

// 1.1 模拟鼠标移动 (接收 Absolute - 绝对坐标)
Napi::Value MoveMouseAbs(const Napi::CallbackInfo& info) {
    double x = info[0].As<Napi::Number>().DoubleValue();
    double y = info[1].As<Napi::Number>().DoubleValue();

    CGPoint newPos = CGPointMake(x, y);
    
    CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, newPos, kCGMouseButtonLeft);
    CGEventPost(kCGHIDEventTap, move);
    CFRelease(move);
    return info.Env().Null();
}

// 2. 模拟点击 (修复：支持 clickCount)
Napi::Value ClickMouse(const Napi::CallbackInfo& info) {
    int btnCode = info[0].As<Napi::Number>().Int32Value(); 
    bool isDown = info[1].As<Napi::Boolean>().Value();
    int clickCount = info[2].As<Napi::Number>().Int32Value(); // 新增参数：点击次数
    
    // UioHook定义: 1=Left, 2=Right, 3=Middle
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
    
    // 关键修复：显式设置点击计数 (1=单击, 2=双击, 3=三击)
    // 如果不设置，macOS 只能靠时间间隔猜测，网络延迟会导致猜测失败
    CGEventSetIntegerValueField(click, kCGMouseEventClickState, clickCount);
    
    CGEventPost(kCGHIDEventTap, click);
    CFRelease(click);
    return info.Env().Null();
}

// 3. 模拟键盘
Napi::Value KeyEvent(const Napi::CallbackInfo& info) {
    int keyCode = info[0].As<Napi::Number>().Int32Value();
    bool isDown = info[1].As<Napi::Boolean>().Value();
    
    CGEventRef key = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)keyCode, isDown);
    CGEventPost(kCGHIDEventTap, key);
    CFRelease(key);
    return info.Env().Null();
}

// 4. 模拟触控板滚动
Napi::Value ScrollEvent(const Napi::CallbackInfo& info) {
    int dy = info[0].As<Napi::Number>().Int32Value();
    int dx = info[1].As<Napi::Number>().Int32Value();

    // 使用 Pixel 单位
    CGEventRef scroll = CGEventCreateScrollWheelEvent2(NULL, kCGScrollEventUnitPixel, 2, dy, dx, 0);
    
    // 关键：设置为连续滚动模式，这会让 macOS 启用平滑滚动算法
    CGEventSetIntegerValueField(scroll, kCGScrollWheelEventIsContinuous, 1);
    
    CGEventPost(kCGHIDEventTap, scroll);
    CFRelease(scroll);
    return info.Env().Null();
}

// 5. 瞬移
Napi::Value WarpMouse(const Napi::CallbackInfo& info) {
    double x = info[0].As<Napi::Number>().DoubleValue();
    double y = info[1].As<Napi::Number>().DoubleValue();
    CGPoint newPos = CGPointMake(x, y);
    CGWarpMouseCursorPosition(newPos);
    return info.Env().Null();
}

// 6. 光标显隐
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

// 7. 权限检查
Napi::Value CheckAuth(const Napi::CallbackInfo& info) {
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    bool trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    return Napi::Boolean::New(info.Env(), trusted);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("moveMouse", Napi::Function::New(env, MoveMouse));
    exports.Set("moveMouseAbs", Napi::Function::New(env, MoveMouseAbs));
    exports.Set("clickMouse", Napi::Function::New(env, ClickMouse));
    exports.Set("keyEvent", Napi::Function::New(env, KeyEvent));
    exports.Set("scrollEvent", Napi::Function::New(env, ScrollEvent));
    exports.Set("warpMouse", Napi::Function::New(env, WarpMouse));
    exports.Set("setCursor", Napi::Function::New(env, SetCursor));
    exports.Set("checkAuth", Napi::Function::New(env, CheckAuth));
    return exports;
}

NODE_API_MODULE(bridge, Init)