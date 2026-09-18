-- Seed knowledge_chunks with original Java interview content (11 chunks).
-- Embeddings are left NULL here; the ai-seed-knowledge edge function backfills
-- them via Gemini text-embedding-004 when invoked from a network-enabled client.
-- Idempotent: uses ON CONFLICT DO NOTHING based on a content-prefix uniqueness constraint.

ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS content_prefix text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_chunks_content_prefix_key'
  ) THEN
    ALTER TABLE knowledge_chunks ADD CONSTRAINT knowledge_chunks_content_prefix_key UNIQUE (content_prefix);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION knowledge_chunks_set_prefix()
RETURNS trigger AS $$
BEGIN
  NEW.content_prefix := left(NEW.content, 200);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_chunks_prefix_trigger ON knowledge_chunks;
CREATE TRIGGER knowledge_chunks_prefix_trigger
BEFORE INSERT ON knowledge_chunks
FOR EACH ROW EXECUTE FUNCTION knowledge_chunks_set_prefix();

INSERT INTO knowledge_chunks (content, source_category, topic_tags, embedding) VALUES
('JDK, JRE, and JVM are three distinct layers of the Java platform.

JVM (Java Virtual Machine) is an abstract machine that executes Java bytecode. It is what makes Java platform-independent at runtime: the same compiled .class file can run on any OS with a JVM implementation. The JVM handles class loading, bytecode verification, execution (interpreter + JIT compiler), garbage collection, and runtime data areas (heap, stack, method area, PC register, native method stack).

JRE (Java Runtime Environment) is the JVM plus the core libraries (java.lang, java.util, java.io, etc.) needed to run Java applications. A JRE is enough to run Java programs but not to develop them.

JDK (Java Development Kit) is the JRE plus development tools: javac (the compiler), javap, jdb, javadoc, and (in modern JDKs) jshell. You need a JDK to compile Java source into bytecode.

Platform independence in Java comes from this two-step model: source code is compiled to bytecode (OS-agnostic), and the JVM interprets/JIT-compiles that bytecode for the specific OS at runtime. This is "write once, run anywhere" — the bytecode is portable, the JVM is platform-specific.',
'java_fundamentals', ARRAY['JDK','JRE','JVM','platform independence'], NULL),
('Java has two categories of data types: primitive and reference.

The 8 primitive types are: byte (8-bit), short (16-bit), int (32-bit), long (64-bit), float (32-bit IEEE 754), double (64-bit IEEE 754), char (16-bit Unicode), boolean (true/false, size JVM-dependent). Primitives are stored on the stack (when local) and have default values when they are fields (0 for numeric, false for boolean, ''\u0000'' for char).

Reference types point to objects on the heap: classes, interfaces, arrays, and type variables. Reference fields default to null.

Each primitive has a corresponding wrapper class in java.lang: Byte, Short, Integer, Long, Float, Double, Character, Boolean. Autoboxing/unboxing converts between them automatically (Integer i = 5; int n = i;), but autoboxing uses cached instances for small ranges (Integer caches -128..127 by default) — so == on boxed Integers in that range returns true, but outside it returns false. Always use .equals() on wrapper instances.

Common interview trap: comparing two Integer objects with == works for values in the cache range but fails outside it. Use .equals() for value comparison.',
'java_fundamentals', ARRAY['data types','primitives','wrappers'], NULL),
('The four pillars of OOP in Java:

Encapsulation: bundling data (fields) and behavior (methods) into a single unit (class) and restricting direct access to the fields via access modifiers. In Java this is done by making fields private and exposing getters/setters. Encapsulation protects invariants — a setter can validate input before writing, so the object never enters an invalid state.

Inheritance: a subclass (extends) reuses fields and methods from a parent class. Java supports single class inheritance (a class can extend only one class) but allows a class to implement multiple interfaces. Inheritance models "is-a" relationships. Use it when behavior is genuinely shared; prefer composition ("has-a") when behavior is reusable but not a true subtype, because composition is more flexible and doesn''t bind you to a parent''s implementation.

Polymorphism: one interface, many forms. In Java this shows up as (1) compile-time polymorphism — method overloading (same method name, different parameter lists in the same class); (2) runtime polymorphism — method overriding (subclass redefines a parent method), and the JVM dispatches the call to the actual object''s implementation at runtime (dynamic dispatch). A parent reference can hold a child object: Animal a = new Dog(); a.speak() calls Dog''s speak().

Abstraction: hiding implementation details and exposing only the essential contract. In Java this is achieved via abstract classes (which can have state and concrete methods) and interfaces (which historically had only abstract methods, but since Java 8 can have default and static methods, and since Java 9 can have private methods). Abstraction lets callers depend on the "what" without knowing the "how."',
'java_fundamentals', ARRAY['encapsulation','inheritance','polymorphism','abstraction'], NULL),
('Abstract class vs interface in Java:

Abstract class: declared with abstract. Can have constructors, instance fields (any access modifier), concrete methods, and abstract methods (no body). A class extends exactly one abstract class. Use it when subclasses share state and partial implementation — e.g., AbstractList provides skeletal List behavior.

Interface: declared with interface. All fields are implicitly public static final (constants). Methods are implicitly public. Pre-Java 8: only abstract methods. Java 8+: default and static methods with bodies. Java 9+: private methods (for sharing code between default methods). A class can implement multiple interfaces. Use it to define a contract that any class can satisfy, regardless of where it sits in the class hierarchy — e.g., Comparable, Iterable, Serializable.

Rules of thumb: prefer interfaces for type definitions; use abstract classes only when you have real implementation and state to share. If you need multiple inheritance of type, interfaces are the only option.

Access modifiers (from most to least restrictive):
- private: visible only inside the same class.
- default (package-private, no modifier): visible inside the same package.
- protected: visible inside the same package AND to subclasses (even in other packages).
- public: visible everywhere.

A subclass can widen access (a protected parent method can be overridden as public) but cannot narrow it.',
'java_fundamentals', ARRAY['abstract class','interface','access modifiers'], NULL),
('Marker interfaces in Java are interfaces with no methods. They exist purely to tag a class as having some property the JVM or library code checks for via instanceof.

Examples from the JDK:
- java.io.Serializable: marks a class as serializable. Object.writeObject checks instanceof Serializable and throws NotSerializableException otherwise. The interface itself declares no methods — it''s a flag.
- java.lang.Cloneable: marks a class as permitting Object.clone() to make a field-by-field copy. Without it, clone() throws CloneNotSupportedException.
- java.util.RandomAccess: marks List implementations (ArrayList, CopyOnWriteArrayList) that support fast random (index-based) access, so callers can choose an algorithm that benefits from O(1) get(i).

Marker interfaces are a pre-annotation mechanism. Today, the modern equivalent is an annotation (@FunctionalInterface, @Override), but marker interfaces still appear in legacy code and are still a valid interview topic. The advantage of a marker interface over an annotation is that the type system itself enforces it — you can write a method that only accepts Serializable, which the compiler checks; with an annotation you''d have to check at runtime.',
'java_fundamentals', ARRAY['marker interfaces','Serializable','Cloneable'], NULL),
('Java Collections — core comparisons:

ArrayList vs LinkedList: both implement List. ArrayList is backed by a resizable array — O(1) random access (get/set by index), O(1) amortized append, O(n) insert/remove at an arbitrary position because elements shift. LinkedList is backed by a doubly-linked list — O(n) random access (must walk from head), O(1) insert/remove at an iterator position (no shifting, just pointer updates) but you still pay O(n) to find the position. In practice ArrayList is almost always preferred — it has better cache locality and lower per-element overhead. LinkedList is only useful when you frequently insert/remove at both ends (use it as a Deque) or iterate with ListIterator while modifying.

HashMap vs TreeMap: HashMap is a hash table — O(1) average get/put, no ordering guarantee, allows one null key and multiple null values. TreeMap is a Red-Black tree — O(log n) get/put, keeps keys in sorted order (natural ordering or a Comparator), no null keys (would break comparison). Use HashMap by default; use TreeMap only when you need sorted iteration or range queries (subMap, headMap, tailMap).

HashSet vs TreeSet: same relationship as above, just for sets (no duplicates). HashSet is O(1) average; TreeSet is O(log n) and sorted.

HashMap internals worth knowing: since Java 8, when a bucket''s linked list grows past a threshold (8+ entries and table size >= 64), it converts to a balanced tree to prevent the O(n) pathological case from a bad hash function or hash collision attack. Capacity doubles when load factor (default 0.75) is exceeded.',
'java_fundamentals', ARRAY['ArrayList','LinkedList','HashMap','TreeMap','HashSet','TreeSet'], NULL),
('Iterator vs ListIterator:

Iterator (java.util.Iterator): forward-only, can read (next) and remove (remove) the current element. Works on any Collection. Use it when you just need to walk a collection once and optionally remove elements safely during iteration (the only safe way to remove during a for-each loop).

ListIterator (java.util.ListIterator extends Iterator): bidirectional, works only on List implementations. Adds hasPrevious/previous (walk backward), nextIndex/previousIndex, set (replace the last returned element), and add (insert at the current position). Use it when you need to walk a list in both directions or modify it while iterating.

Both throw ConcurrentModificationException if the underlying collection is structurally modified outside the iterator''s own methods — this is a fail-fast design. (CopyOnWriteArrayList''s iterator does NOT throw — it''s fail-safe and reflects the snapshot taken at iterator creation.)

Comparable vs Comparator:

Comparable (java.lang.Comparable): defines the natural ordering of a class via a single compareTo(T o) method. Implemented by the class itself — the class says "I know how to order myself." Example: String is Comparable<String>, Integer is Comparable<Integer>. Sort with Collections.sort(list) or list.sort(null) — uses natural ordering.

Comparator (java.util.Comparator): defines an external ordering via compare(T a, T b). Implemented as a separate object — useful when you want to sort the same type in multiple ways (by name, by age, by salary) or when you can''t modify the class (it''s a library class). Sort with list.sort(comparator) or Collections.sort(list, comparator).

Modern idiom: Comparator.comparing(Person::getName).thenComparing(Person::getAge) — type-safe, fluent, and reads like English.',
'java_fundamentals', ARRAY['Iterator','ListIterator','Comparable','Comparator'], NULL),
('Java exception hierarchy:

Throwable is the root. Two main branches:
- Error: serious JVM-level problems (OutOfMemoryError, StackOverflowError). Application code should not catch these.
- Exception: application-level problems. Split into:
  - Checked exceptions (subclasses of Exception except RuntimeException): the compiler forces you to handle them (try/catch or throws). Examples: IOException, SQLException, ClassNotFoundException. They represent recoverable, expected conditions — e.g., a file not existing, a network timeout.
  - Unchecked exceptions (subclasses of RuntimeException): the compiler does not force handling. Examples: NullPointerException, IllegalArgumentException, ArrayIndexOutOfBoundsException, ArithmeticException. They represent programming errors — bugs you should fix, not catch.

try/catch/finally: try wraps risky code; catch handles a specific exception type; finally runs whether or not an exception was thrown (used for cleanup — closing files, releasing resources). Java 7+ try-with-resources auto-closes AutoCloseable resources and generates the finally for you. A finally block executes even if try has a return — and if finally also returns, that return overrides try''s. System.exit() is the only thing that prevents finally from running.

throw vs throws:
- throw new IOException("msg") — actually throws an exception object at runtime.
- throws IOException — declares in a method signature that the method may throw a checked exception, forcing callers to handle it. It''s a compile-time contract, not an action.

Rule of thumb: throw checked exceptions for expected, recoverable conditions; throw unchecked exceptions for programming errors. Don''t catch RuntimeException broadly (catch (RuntimeException e)) — it hides bugs.',
'java_fundamentals', ARRAY['checked exceptions','unchecked exceptions','try/catch/finally','throw vs throws'], NULL),
('Java multithreading fundamentals:

Thread states (Thread.State enum): NEW (created, not started), RUNNABLE (started, eligible to run — may be running or ready in the scheduler), BLOCKED (waiting for a monitor lock to enter a synchronized block), WAITING (waiting indefinitely for another thread to notify — Object.wait(), Thread.join() without timeout, LockSupport.park()), TIMED_WAITING (waiting with a timeout — sleep(millis), wait(millis), join(millis)), TERMINATED (run() finished). A thread can move between these states many times.

Process vs thread: a process has its own memory space; threads within a process share the heap and class metadata but have their own stack and PC register. Threads are lighter than processes — context switching is cheaper, and shared memory makes communication fast (but requires synchronization).

Synchronization: the synchronized keyword (on a method or block) acquires the monitor lock of an object. Only one thread can hold a given object''s monitor at a time, so synchronized methods/blocks on the same object are mutually exclusive. From Java 5 you can also use java.util.concurrent.locks.ReentrantLock for finer control (tryLock with timeout, fairness, interruptible).

Deadlock: two or more threads each hold a lock the other needs, so they wait forever. Classic case: thread A holds lock1 and waits for lock2; thread B holds lock2 and waits for lock1. Prevention: always acquire locks in a fixed global order; use tryLock with timeouts; minimize lock scope; prefer higher-level concurrency utilities (ExecutorService, Concurrent collections, CountDownLatch) over hand-rolled synchronized blocks.

wait/notify/notifyAll: must be called while holding the object''s monitor (inside synchronized). wait() releases the lock and puts the thread in WAITING; notify() wakes one waiting thread (arbitrary choice); notifyAll() wakes all. The woken thread must reacquire the lock before continuing. Always call wait() in a loop (while (!condition)) to guard against spurious wakeups and the gap between notify and reacquire. Java 5+ java.util.concurrent higher-level primitives (Condition, BlockingQueue, CountDownLatch) are usually cleaner than raw wait/notify.

sleep vs wait: Thread.sleep(millis) does NOT release any lock — it just pauses the thread; Object.wait(millis) releases the monitor lock and can be woken by notify. sleep is on Thread; wait is on Object (the monitor).

daemon vs user threads: a daemon thread (setDaemon(true) before start) does not keep the JVM alive — when all user threads finish, the JVM exits and daemon threads are terminated. Use daemon for background housekeeping (gc, finalizer thread); use user threads for work that should complete (request handling).',
'java_fundamentals', ARRAY['thread lifecycle','synchronization','deadlock','wait/notify'], NULL),
('Java 8+ features:

Lambda expressions: concise syntax for instances of functional interfaces (interfaces with exactly one abstract method). (int a, int b) -> a + b. The type of the lambda is inferred from the target type — this is "target typing." Lambdas close over effectively final local variables from the enclosing scope.

Functional interfaces: interfaces with exactly one abstract method (default and static methods don''t count). The package java.util.function provides common ones: Function<T,R> (apply), Predicate<T> (test), Consumer<T> (accept, returns void), Supplier<T> (get, no args), BiFunction<T,U,R>, UnaryOperator<T>. @FunctionalInterface is an optional annotation that makes the compiler enforce the single-abstract-method rule. Your own APIs should accept functional interfaces, not concrete lambdas, so callers can pass method references (String::length) or lambdas.

Streams: a declarative pipeline for processing sequences. A stream is NOT a data structure — it''s a view. Pipeline: source (collection.stream(), Stream.of(), IntStream.range()) → intermediate operations (filter, map, sorted, distinct, limit, skip — all lazy, return Stream) → terminal operation (collect, reduce, count, forEach, findFirst, anyMatch — executes the pipeline and produces a result or side effect). Streams are single-use — once a terminal op runs, the stream is closed.

Key points:
- Laziness: intermediate ops are not executed until a terminal op runs. This lets the pipeline short-circuit (limit, findFirst).
- Internal iteration: you describe what to do, the stream decides how — enabling parallelization via parallelStream().
- No mutation: streams don''t modify their source. Collect into a new collection rather than mutating in place.

Common idiom: list.stream().filter(s -> s.length() > 3).map(String::toUpperCase).sorted().collect(Collectors.toList());',
'java_fundamentals', ARRAY['streams','lambda','functional interfaces'], NULL),
('Java memory model:

Stack: each thread has its own runtime stack. Method frames hold local variables (primitives and references), the operand stack, and frame data. Stack is fast, thread-local, and auto-cleaned on method return. Deep recursion can overflow it (StackOverflowError).

Heap: shared by all threads, holds all objects (instances) and arrays. Garbage collected. New objects go to the young generation (Eden + survivor spaces); long-lived objects are promoted to the old generation. The heap is where OutOfMemoryError lives when you run out.

Method area (JDK 8+: metaspace): stores class metadata, static fields, constant pools, method bytecode. Pre-Java 8 this was part of the heap called PermGen; Java 8+ it''s native memory (Metaspace) and grows automatically.

Garbage collection: the JVM automatically reclaims unreachable objects. Reachability analysis: starting from GC roots (local variables in active frames, static fields, JNI references), the GC walks the object graph; anything not reachable is garbage. Common collectors: Serial (single-threaded, small heaps), Parallel (throughput, multi-threaded), CMS (low-pause, deprecated in Java 9, removed in 14), G1 (default in Java 9+, region-based, predictable pauses), ZGC and Shenandoah (sub-millisecond pauses, modern low-latency). You can hint the GC with System.gc() but it''s not guaranteed.

String pool and immutability: String literals are interned in the string pool (a special area of the heap since Java 7) — "abc" appears once even if it occurs in 100 classes. Strings are immutable: once created, their value never changes. This makes them safe to share (the pool relies on this), thread-safe without synchronization, and usable as HashMap keys (their hash is cached). new String("abc") creates a new object on the heap outside the pool; "abc" uses the pool. Use String.intern() to force pool lookup. For heavy string building, use StringBuilder (not thread-safe, faster) or StringBuffer (thread-safe, slower).',
'java_fundamentals', ARRAY['stack vs heap','garbage collection','string pool','immutability'], NULL)
ON CONFLICT (content_prefix) DO NOTHING;