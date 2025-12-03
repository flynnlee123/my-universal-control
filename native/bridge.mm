#include <napi.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

// ================== Slave: 模拟输入 ==================

// 1. 模拟鼠标相对移动 (Delta)
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

// 2. 模拟点击
Napi::Value ClickMouse(const Napi::CallbackInfo& info) {
    int btnCode = info[0].As<Napi::Number>().Int32Value(); // 1=Left, 2=Right
    bool isDown = info[1].As<Napi::Boolean>().Value();
    
    CGMouseButton btn = kCGMouseButtonLeft;
    CGEventType type = isDown ? kCGEventLeftMouseDown : kCGEventLeftMouseUp;
    
    if (btnCode == 2) {
        btn = kCGMouseButtonRight;
        type = isDown ? kCGEventRightMouseDown : kCGEventRightMouseUp;
    }
    
    CGEventRef event = CGEventCreate(NULL);
    CGPoint pos = CGEventGetLocation(event);
    CFRelease(event);
    
    CGEventRef click = CGEventCreateMouseEvent(NULL, type, pos, btn);
    CGEventPost(kCGHIDEventTap, click);
    CFRelease(click);
    return info.Env().Null();
}

// 3. 模拟键盘 (支持底层硬件码)
Napi::Value KeyEvent(const Napi::CallbackInfo& info) {
    int keyCode = info[0].As<Napi::Number>().Int32Value();
    bool isDown = info[1].As<Napi::Boolean>().Value();
    
    CGEventRef key = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)keyCode, isDown);
    CGEventPost(kCGHIDEventTap, key);
    CFRelease(key);
    return info.Env().Null();
}

// 4. 模拟触控板滚动 (重点优化)
Napi::Value ScrollEvent(const Napi::CallbackInfo& info) {
    int dy = info[0].As<Napi::Number>().Int32Value();
    int dx = info[1].As<Napi::Number>().Int32Value();

    // ScrollWheelEvent2 参数: Source, Units(Pixel=2), AxisCount, dy, dx
    CGEventRef scroll = CGEventCreateScrollWheelEvent2(
        NULL, 
        kCGScrollEventUnitPixel, 
        2,  // 轴数量 (Y和X)
        dy, // wheel1 (Y轴)
        dx, // wheel2 (X轴)
        0   // wheel3 (Z轴/未使用)
    );
    
    // 设置 Continuous 标志位，让系统认为这是触控板的自然滚动，而不是生硬的鼠标滚轮
    CGEventSetIntegerValueField(scroll, kCGScrollWheelEventIsContinuous, 1);
    
    CGEventPost(kCGHIDEventTap, scroll);
    CFRelease(scroll);
    return info.Env().Null();
}

// ================== Master: 鼠标控制 ==================

// 5. 隐藏/显示光标
Napi::Value SetCursor(const Napi::CallbackInfo& info) {
    bool visible = info[0].As<Napi::Boolean>().Value();
    if (visible) CGDisplayShowCursor(kCGDirectMainDisplay);
    else CGDisplayHideCursor(kCGDirectMainDisplay);
    return info.Env().Null();
}

// 6. 瞬移鼠标 (Warp) - 用于无限滚动
Napi::Value WarpMouse(const Napi::CallbackInfo& info) {
    double x = info[0].As<Napi::Number>().DoubleValue();
    double y = info[1].As<Napi::Number>().DoubleValue();
    CGPoint newPos = CGPointMake(x, y);
    CGWarpMouseCursorPosition(newPos);
    return info.Env().Null();
}

// 7. 检查权限
Napi::Value CheckAuth(const Napi::CallbackInfo& info) {
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    BOOL trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    return Napi::Boolean::New(info.Env(), trusted);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("moveMouse", Napi::Function::New(env, MoveMouse));
    exports.Set("clickMouse", Napi::Function::New(env, ClickMouse));
    exports.Set("keyEvent", Napi::Function::New(env, KeyEvent));
    exports.Set("scrollEvent", Napi::Function::New(env, ScrollEvent));
    exports.Set("setCursor", Napi::Function::New(env, SetCursor));
    exports.Set("warpMouse", Napi::Function::New(env, WarpMouse));
    exports.Set("checkAuth", Napi::Function::New(env, CheckAuth));
    return exports;
}

NODE_API_MODULE(bridge, Init)