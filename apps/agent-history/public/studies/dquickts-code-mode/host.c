#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"

static int interrupts;
static JSValue gate(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    return JS_SuspendCall(ctx);
}
static JSValue alpha(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    return JS_NewString(ctx, "ALPHA");
}
static JSValue beta(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    return JS_NewString(ctx, "BETA");
}
static int interrupt(JSRuntime *rt, void *opaque) {
    JS_RequestSuspend(rt);
    return ++interrupts >= 5;
}
static void fail_js(JSContext *ctx) {
    JSValue error = JS_GetException(ctx);
    const char *s = JS_ToCString(ctx, error);
    fprintf(stderr, "%s\n", s ? s : "exception");
    JS_FreeCString(ctx, s);
    JS_FreeValue(ctx, error);
}
static void install(JSContext *ctx) {
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "gate", JS_NewCFunction(ctx, gate, "gate", 0));
    JS_SetPropertyStr(ctx, global, "alpha", JS_NewCFunction(ctx, alpha, "alpha", 0));
    JS_SetPropertyStr(ctx, global, "beta", JS_NewCFunction(ctx, beta, "beta", 0));
    JS_FreeValue(ctx, global);
}
int main(int argc, char **argv) {
    if (argc < 3) return 64;
    const void *normal[] = {(void *)gate, (void *)alpha, (void *)beta};
    const void *swapped[] = {(void *)gate, (void *)beta, (void *)alpha};
    int swap = argc > 3 && !strcmp(argv[3], "swap");
    int count = argc > 3 && !strcmp(argv[3], "count");
    JSSnapshotHost host = {.natives = swap ? swapped : normal, .native_count = count ? 2 : 3};
    JSRuntime *rt = JS_NewRuntime();
    JSContext *ctx;
    JSValue value;
    if (!strcmp(argv[1], "resume")) {
        FILE *f = fopen(argv[2], "rb");
        if (!f) return 65;
        fseek(f, 0, SEEK_END);
        long size = ftell(f);
        rewind(f);
        if (size <= 0 || size > 16 * 1024 * 1024) return 66;
        unsigned char *data = malloc((size_t)size);
        if (!data || fread(data, 1, size, f) != (size_t)size) return 67;
        fclose(f);
        JSSnapshotResult result;
        char error[256];
        if (JS_ReadSnapshot(rt, data, size, NULL, 0, &host, &result, error, sizeof(error))) {
            fprintf(stderr, "%s\n", error);
            free(data);
            JS_FreeRuntime(rt);
            return 2;
        }
        free(data);
        ctx = result.contexts[0];
        JS_FreeSnapshotResult(rt, &result);
        JSMemoryUsage usage;
        JS_ComputeMemoryUsage(rt, &usage);
        fprintf(stderr, "restored_malloc_limit=%lld\n", (long long)usage.malloc_limit);
        /* A production host must reapply its policy before continuing. */
        JS_SetMemoryLimit(rt, 8 * 1024 * 1024);
        JS_SetMaxStackSize(rt, 256 * 1024);
        value = JS_ResumeWith(ctx, JS_NewString(ctx, "TOOL_RESULT"), 0);
    } else {
        ctx = JS_NewContext(rt);
        install(ctx);
        JS_SetMemoryLimit(rt, 8 * 1024 * 1024);
        JS_SetMaxStackSize(rt, 256 * 1024);
        const char *src =
            "const shared = { n: 41 }; const alias = shared;"
            "const next = (() => { let n = 0; return () => ++n; })();"
            "next(); const answer = gate();"
            "JSON.stringify([shared === alias, ++alias.n, next(), answer, alpha(), beta()]);";
        if (!strcmp(argv[1], "callback")) src = "[1].map(() => gate());";
        if (!strcmp(argv[1], "defer")) {
            src = "[1].map(() => { while (true) {} });";
            JS_SetInterruptHandler(rt, interrupt, NULL);
        }
        value = JS_Eval(ctx, src, strlen(src), "<study>", JS_EVAL_TYPE_GLOBAL);
        if (JS_IsSuspended(rt)) {
            size_t size;
            unsigned char *data = JS_WriteSnapshot(ctx, &size, &host, NULL, 0, 0);
            if (!data) { fail_js(ctx); return 3; }
            FILE *f = fopen(argv[2], "wb");
            if (!f || fwrite(data, 1, size, f) != size || fclose(f)) return 68;
            printf("{\"suspended\":true,\"bytes\":%zu,\"memoryLimit\":8388608}\n", size);
            js_free(ctx, data);
            JS_FreeContext(ctx);
            JS_FreeRuntime(rt);
            return 0;
        }
    }
    int status = 0;
    if (JS_IsException(value)) { fail_js(ctx); status = 1; }
    else {
        const char *s = JS_ToCString(ctx, value);
        puts(s ? s : "null");
        JS_FreeCString(ctx, s);
    }
    if (interrupts) fprintf(stderr, "interrupts=%d suspended=%d\n", interrupts, JS_IsSuspended(rt));
    JS_FreeValue(ctx, value);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return status;
}
