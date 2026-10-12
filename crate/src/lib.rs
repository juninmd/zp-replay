//! Browser-facing C ABI over `hldemo`.
//!
//! Only the recording player's position is extracted (ClientData frames).
//! Other players and bots live in delta-compressed entity messages, which
//! `hldemo` does not decode.

use std::cell::RefCell;
use std::slice;

thread_local! {
    // flat [t, x, y, z, t, x, y, z, ...]
    static SAMPLES: RefCell<Vec<f32>> = RefCell::new(Vec::new());
}

/// Reserve `len` bytes in wasm memory for the host to write a demo into.
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free a buffer previously returned by `alloc` with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Parse a demo and store its recorder-position samples.
/// Returns the number of samples, or -1 if the demo does not parse.
#[no_mangle]
pub unsafe extern "C" fn parse_origins(ptr: *const u8, len: usize) -> i32 {
    let bytes = slice::from_raw_parts(ptr, len);
    let demo = match hldemo::Demo::parse(bytes) {
        Ok(demo) => demo,
        Err(_) => return -1,
    };

    let mut out = Vec::new();
    for entry in &demo.directory.entries {
        for frame in &entry.frames {
            if let hldemo::FrameData::ClientData(ref d) = frame.data {
                out.push(frame.time);
                out.extend_from_slice(&d.origin);
            }
        }
    }

    let count = (out.len() / 4) as i32;
    SAMPLES.with(|s| *s.borrow_mut() = out);
    count
}

/// Pointer to the samples stored by the last `parse_origins` call.
#[no_mangle]
pub extern "C" fn samples_ptr() -> *const f32 {
    SAMPLES.with(|s| s.borrow().as_ptr())
}
