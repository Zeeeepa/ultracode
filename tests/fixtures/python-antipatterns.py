# Test fixture: Python code with various antipatterns for detection testing

import pickle
import subprocess
import yaml
import asyncio
import random
from concurrent.futures import ThreadPoolExecutor


# ── Error handling antipatterns ──────────────────────────────────

def swallowed_exception():
    try:
        risky_operation()
    except:
        pass  # bare except + swallowed


def generic_raise(x):
    if x < 0:
        raise Exception("bad value")  # generic raise


def wide_try_block():
    try:
        a = 1
        b = 2
        c = 3
        d = 4
        e = 5
        f = a + b
        g = c + d
        h = e + f
        i = g + h
        j = i + 1
        result = j * 2
    except ValueError:
        pass


# ── Type safety antipatterns ─────────────────────────────────────

def type_ignore_abuse():
    x = "hello"  # type: ignore
    y = 42  # type: ignore
    return x + y  # type: ignore


from typing import Any

def any_abuse(data: Any, config: Any, options: Any) -> Any:
    return data


# ── Security antipatterns ────────────────────────────────────────

def eval_usage(user_input):
    result = eval(user_input)  # eval
    exec("print('hello')")  # exec
    return result


def subprocess_shell(cmd):
    subprocess.run(cmd, shell=True)  # shell=True


def sql_injection(user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"  # SQL injection
    return query


def pickle_load_untrusted(path):
    with open(path, "rb") as f:
        return pickle.load(f)  # pickle load


def yaml_load_unsafe(data):
    return yaml.load(data)  # yaml.load without SafeLoader


# ── Pandas antipatterns ──────────────────────────────────────────

def pd_iterrows_usage(df):
    for idx, row in df.iterrows():
        process(row)


def pd_append_loop(df):
    result = df
    for i in range(100):
        result = result.append({"val": i})


def pd_chained_indexing(df):
    df["a"]["b"] = 42  # chained indexing


def pd_inplace(df):
    df.dropna(inplace=True)  # inplace=True


def pd_nan_compare(df):
    mask = df["col"] == None  # NaN comparison
    mask2 = df["val"] == float('nan')


def pd_read_csv_no_dtype(path):
    import pandas as pd
    df = pd.read_csv(path)  # no dtype


# ── NumPy antipatterns ───────────────────────────────────────────

def np_loop_access(arr):
    result = []
    for i in range(len(arr)):
        result.append(arr[i] * 2)  # numpy loop


def np_float_cmp():
    import numpy as np
    a = np.array([0.1 + 0.2])
    if a == 0.3:  # float comparison
        return True


def np_append_loop():
    import numpy as np
    arr = np.array([])
    for i in range(1000):
        arr = np.append(arr, i)  # np.append in loop


# ── Sklearn antipatterns ─────────────────────────────────────────

def sk_data_leakage(X, y):
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split
    X_scaled = StandardScaler().fit_transform(X)  # leakage!
    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y)


def sk_no_random_state(X, y):
    from sklearn.ensemble import RandomForestClassifier
    model = RandomForestClassifier()  # no random_state
    model.fit(X, y)


# ── Matplotlib antipatterns ──────────────────────────────────────

def plt_no_close_loop(data_list):
    import matplotlib.pyplot as plt
    for data in data_list:
        fig, ax = plt.subplots()
        ax.plot(data)
        fig.savefig("out.png")
        # missing plt.close(fig)


def plt_mixed_api():
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots()
    ax.set_title("My Plot")  # OO API
    plt.xlabel("X axis")  # stateful API — mixed!


# ── Concurrency antipatterns ─────────────────────────────────────

async def async_no_await():
    x = 1 + 1
    return x  # async without await


async def asyncio_run_in_async():
    result = asyncio.run(some_coroutine())  # RuntimeError
    return result


def threadpool_no_max():
    with ThreadPoolExecutor() as pool:  # no max_workers
        pool.map(process, range(10000))


def gil_thread_cpu():
    import numpy as np
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda x: np.sum(x), data))  # CPU-bound in threads


# ── API design antipatterns ──────────────────────────────────────

def many_positional_args(a, b, c, d, e, f, g):
    return a + b + c + d + e + f + g


def bool_trap(data, verbose: bool = False, force: bool = False, recursive: bool = True):
    pass


def open_no_encoding(path):
    f = open(path)  # no encoding, no with
    data = f.read()
    f.close()
    return data


# ── Resource antipatterns ────────────────────────────────────────

class ResourceHolder:
    def __del__(self):  # unreliable finalizer
        self.cleanup()


# ── Reproducibility antipatterns ─────────────────────────────────

def no_random_seed():
    x = random.randint(1, 100)  # no seed
    y = random.choice([1, 2, 3])
    return x + y


# ── Testing antipatterns ─────────────────────────────────────────

def test_float_equality():
    result = 0.1 + 0.2
    assert result == 0.3  # float equality in test


# ── Performance antipatterns ─────────────────────────────────────

def regex_in_loop(texts):
    import re
    results = []
    for text in texts:
        match = re.search(r"\d+", text)  # re in loop
        results.append(match)
    return results


def string_concat_loop(items):
    result = ""
    for item in items:
        result += str(item)  # string concat in loop
    return result
