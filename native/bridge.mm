#include <napi.h>
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

// 1. 模拟鼠标移动 (接收 Delta)
Napi::Value MoveMouse(const Napi::CallbackInfo& info) {
    double dx = info[0].As<Napi::Number>().DoubleValue();
    double dy = info[1].As<Napi::Number>().DoubleValue();

    CGEventRef event = CGEventCreate(NULL);
    CGPoint current = CGEventGetLocation(event);
    CFRelease(event);

    // 加上 Delta
    CGPoint newPos = CGPointMake(current.x + dx, current.y + dy);
    
    CGEventRef move = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, newPos, kCGMouseButtonLeft);
    CGEventPost(kCGHIDEventTap, move);
    CFRelease(move);
    return info.Env().Null();
}

// 2. 模拟点击
Napi::Value ClickMouse(const Napi::CallbackInfo& info) {
    int btnCode = info[0].As<Napi::Number>().Int32Value(); 
    bool isDown = info[1].As<Napi::Boolean>().Value();
    
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
    CGEventPost(kCGHIDEventTap, click);
    CFRelease(click);
    return info.Env().Null();
}

// 3. 模拟键盘 (强制使用硬件码)
Napi::Value KeyEvent(const Napi::CallbackInfo& info) {
    // 这里的 keyCode 必须是 macOS 的 Hardware Code
    int keyCode = info[0].As<Napi::Number>().Int32Value();
    bool isDown = info[1].As<Napi::Boolean>().Value();
    
    CGEventRef key = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)keyCode, isDown);
    CGEventPost(kCGHIDEventTap, key);
    CFRelease(key);
    return info.Env().Null();
}

// 4. 模拟触控板滚动 (修复版)
Napi::Value ScrollEvent(const Napi::CallbackInfo& info) {
    int dy = info[0].As<Napi::Number>().Int32Value();
    int dx = info[1].As<Napi::Number>().Int32Value();

    // 关键修正: 使用 kCGScrollEventUnitPixel (0) 
    // 参数: Source, Units, AxisCount, wheel1(Y), wheel2(X), wheel3
    CGEventRef scroll = CGEventCreateScrollWheelEvent2(NULL, kCGScrollEventUnitPixel, 2, dy, dx, 0);
    
    // 开启惯性模拟
    CGEventSetIntegerValueField(scroll, kCGScrollWheelEventIsContinuous, 1);
    
    CGEventPost(kCGHIDEventTap, scroll);
    CFRelease(scroll);
    return info.Env().Null();
}

// 5. 瞬移 (Warp)
Napi::Value WarpMouse(const Napi::CallbackInfo& info) {
    double x = info[0].As<Napi::Number>().DoubleValue();
    double y = info[1].As<Napi::Number>().DoubleValue();
    CGPoint newPos = CGPointMake(x, y);
    CGWarpMouseCursorPosition(newPos);
    return info.Env().Null();
}

// 6. 光标显隐 (修复版：遍历所有显示器)
Napi::Value SetCursor(const Napi::CallbackInfo& info) {
    bool visible = info[0].As<Napi::Boolean>().Value();
    
    // 获取当前活动显示器列表
    CGDisplayCount displayCount;
    CGGetActiveDisplayList(0, NULL, &displayCount);
    
    // 分配内存
    CGDirectDisplayID *displays = (CGDirectDisplayID *)malloc(displayCount * sizeof(CGDirectDisplayID));
    CGGetActiveDisplayList(displayCount, displays, &displayCount);
    
    // 遍历所有显示器设置光标状态
    // Fix: 将 int 改为 CGDisplayCount 以消除类型不匹配警告
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

// 7. 权限检查 (补充部分)
Napi::Value CheckAuth(const Napi::CallbackInfo& info) {
    // kAXTrustedCheckOptionPrompt: @YES 会在权限未被授予时自动触发系统弹窗
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    bool trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    return Napi::Boolean::New(info.Env(), trusted);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("moveMouse", Napi::Function::New(env, MoveMouse));
    exports.Set("clickMouse", Napi::Function::New(env, ClickMouse));
    exports.Set("keyEvent", Napi::Function::New(env, KeyEvent));
    exports.Set("scrollEvent", Napi::Function::New(env, ScrollEvent));
    exports.Set("warpMouse", Napi::Function::New(env, WarpMouse));
    exports.Set("setCursor", Napi::Function::New(env, SetCursor));
    // 注册 checkAuth
    exports.Set("checkAuth", Napi::Function::New(env, CheckAuth));
    return exports;
}

NODE_API_MODULE(bridge, Init)