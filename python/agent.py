import sys
import os
import time
import threading
from datetime import datetime, timezone
import re
from pathlib import Path
from enum import Enum
import json
import pyperclip
import PIL.Image
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException
from google import genai
from google.genai import types

class State(Enum):
    NON = 0
    SCHEMA = 1
    SKELETON = 2
    RUN = 3
    END = 4

driver = None
client = None
chat   = None
browser_alive = True
article_id = None
article_dir = None
model_name="gemini-2.5-pro"

class Agent:
    def __init__(self):
        self.state = State.NON
        self.schema = None
        self.skeleton_text = None
        self.start_time = None
        self.image_verified = False

    def create_schema(self, prompt:str):
        print(f"Generating Schema...\n[{prompt}]")

        response2 = chat.send_message(prompt)
        self.schema = extract_codes("typescript", response2.text)[0]

        write_text_file("schema.js", self.schema)

        self.state = State.SCHEMA
        print("schema.js is created.")

    def make_skeleton_from_schema(self):
        setText("schema-text", self.schema)
        clickBtn("create-copy-skeleton-btn")
        waitLog("Text successfully copied to clipboard!")
        self.skeleton_text = pyperclip.paste()
        write_text_file("skeleton.wgsl", self.skeleton_text)

        self.state = State.SKELETON

    def implement_shader(self):
        print("Implementing WGSL codes...")

        if useAI:
            prompt = (
                "Implement WGSL functions.\n\n"
                "Please wrap the WGSL code in ```wgsl and ```.\n"
                "Do not remove the comments at the top of the code.\n"
                "\n"
                f"{self.skeleton_text}"
            )

            response = chat.send_message(prompt)
            response_text = response.text
            write_text_file("wgsl_response.text", response_text)
        else:
            response_text = read_text_file("wgsl_response.text")

        shader_codes = extract_codes("wgsl", response_text)
        set_shader_codes(shader_codes)
        print("Shaders are implemented.")

        self.run_simulation()

    def run(self):
        if not self.image_verified:
            if 3 < time.time() - self.start_time:
                print("capture and download start...")
                clickBtn("capture-btn")
                image_path = wait_for_download_complete()
                self.verify_image(image_path)
    
    def run_simulation(self):
        clickBtn("run-sim-btn")
        waitLog("navigate complete.")

        self.state = State.RUN
        self.start_time = time.time()
        self.image_verified = False

    def modify_codes(self, response_text: str):
        if self.state == State.RUN:
            clickBtn("wizard2-btn")

        if "```typescript" in response_text:
            codes = extract_codes("typescript", response_text)
            assert len(codes) == 1, f"Can not extract schema.\n{response_text}"

            self.schema = codes[0]

            write_text_file("schema.js", self.schema)

            self.state = State.SCHEMA
            print("schema.js is modified.")

        elif "```wgsl" in response_text:
            codes = extract_codes("wgsl", response_text)
            assert len(codes) != 0, f"Can not extract shaders.\n{response_text}"

            set_shader_codes(codes)
            print("Shaders are modified.")
            self.run_simulation()

        else:
            print(f"No modified code.\n[{response_text}]")
            sys.exit()

    def verify_image(self, image_path:str):
        print("Verifying the image...")

        image = PIL.Image.open(image_path)

        prompt = (
            "Verify that the rendered result is correct.\n"
            'If the result is correct, output "THE RESULT IS CORRECT."\n'
            "If modifications are required, output the schema OR the shader. Do not output both the schema and the shader.\n"
            "Enclose the schema in ```typescript and ```, and the shader in ```wgsl and ```.\n"
            "Output the entire code, not just a portion of it.\n"
        )
        response = chat.send_message([ prompt, image ])
        print(response.text)
        if "THE RESULT IS CORRECT" in response.text:
            self.make_thumbnail(image_path)
            self.finish()
        else:
            self.modify_codes(response.text)

    def make_thumbnail(self, image_path:str):
        img = PIL.Image.open(image_path)

        # 2. 収めたい最大の幅と高さをタプルで指定 (幅, 高さ)
        # ※この枠をはみ出さないように、縦横比を保って自動縮小されます
        max_size = (800, 800)

        # 3. thumbnailメソッドを実行（※元の画像オブジェクト自体が上書き変更されます）
        img.thumbnail(max_size)

        # 4. 保存する
        img.save(f"{article_dir}/thumbnail.png")

    def finish(self):
        title = self.write_markdown()
        self.write_article_json(title)
        self.state = State.END
        print("Simulation completed.")

    def write_article_json(self, title:str):
        # strftime を使って指定した形式の文字列に変換
        time_str = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")

        # 保存したいPythonのデータ（辞書）
        data = {
            "id": f"agent-{time_str}",
            "title": title,
            "author": "agent",
            "ai": model_name
        }

        # ファイルを開いて書き込む
        # ⚠️ 日本語を含む場合は encoding="utf-8" を必ず指定します
        with open(f"{article_dir}/article.json", "w", encoding="utf-8") as f:
            json.dump(
                data, 
                f, 
                ensure_ascii=False,  # 日本語をそのまま出力する（\uXXXX に変換しない）
                indent=4             # 4文字分のインデントをつけて見やすく整形する
            )
        print("article.json is created.")

    def write_markdown(self) -> str:
        print("Writing the markdown...")

        prompt = (
            "Write an article in Markdown explaining the observable phenomena, mathematical background, and code for this simulation.\n"
            "For the first line of the output, write the article title after the `#` symbol."
        )
        response = chat.send_message(prompt)

        write_text_file("markdown.md", response.text)
        print("markdown.md is created.")

        first_line = response.text.split('\n', 1)[0]
        assert first_line[0] == "#"
        title = first_line[1:].strip()

        return title

    def handle_error(self, error_text:str):
        print("Fixing the error...")

        prompt = (
            "Fix this error."
            "Please output in accordance with '4. Strict Output Constraints'."
            ""
            f"{error_text}"
        )
        response = chat.send_message(prompt)
        self.modify_codes(response.text)

def write_text_file(file_name:str, text:str):
    with open(f"{article_dir}/{file_name}", "w", encoding="utf-8") as file:
        file.write(text)

def read_text_file(path):
    if not "/" in path:
        path = f"{article_dir}/{path}"

    with open(path, "r", encoding="utf-8") as file:
        text = file.read()

        return text

def create_cache():
    system_prompt = read_text_file("public/schema.md")

    print("Creating cache...")
    cache = client.caches.create(
        model=model_name,
        config=types.CreateCachedContentConfig(
            display_name='WebGPU-Simulation-Architecture',
            system_instruction='Read WebGPU Simulation Architecture Overview.',
            contents=[system_prompt],
            ttl="3600s", # キャッシュの有効期限（Time To Live）。デフォルトは1時間（3600秒）
        )
    )

    print(f"Cache created successfully.")
    print(f"キャッシュ名 (ID): {cache.name}")
    print(f"キャッシュされたトークン数: {cache.usage_metadata.total_token_count}\n")

    return cache

def create_chat_from_cache():
    print("Getting caches list...\n")

    # キャッシュの一覧を取得
    cache_list = list(client.caches.list())

    # 現在時刻 (UTC) を取得
    now_utc = datetime.now(timezone.utc)

    # リストの中から「現在時刻より有効期限が未来（まだ有効）」なキャッシュだけを抽出する
    valid_caches = [c for c in cache_list if c.expire_time > now_utc]

    if len(valid_caches) == 0:
        print("No active context caches found.")
        if ask_yes_no("Do you want to create a cache?"):
            cache = create_cache()
        else:
            return None
    else:
        print(f"\n合計 {len(valid_caches)} 件の有効なキャッシュが見つかりました。")
        # 有効なキャッシュの1件目を使用
        cache = valid_caches[0]

    print(f"display name: {cache.display_name}")
    print(f"cache.name(ID): {cache.name}")
    print(f"model: {cache.model}")
    print(f"create time: {cache.create_time}")
    print(f"expire time: {cache.expire_time}")

    chat = client.chats.create(
        model=model_name,
        config=types.GenerateContentConfig(
            cached_content=cache.name,
        )
    )

    return chat

def extract_codes(lang:str, text: str) -> list[str]:
    # Regular expression pattern to capture text between ```typescript and ```
    # The '?' makes the matching lazy, ensuring it grabs individual blocks 
    # rather than everything from the first open to the last close.
    if lang == "typescript":
        pattern = r"```typescript(.*?)\n```"
    elif lang == "wgsl":
        pattern = r"```wgsl(.*?)\n```"
    else:
        print(f"invalid lang:{lang}")
        sys.exit()

    
    # re.DOTALL allows the dot (.) to match newline characters as well
    matches = re.findall(pattern, text, flags=re.DOTALL)
    if len(matches) != 1:
        print(f"can not extract {lang} code.:{len(matches)}")
        sys.exit()
    
    return matches

def ask_yes_no(question):
    while True:
        choice = input(f"{question} [y/n]: ").lower().strip()
        
        if choice in ['y', 'yes']:
            return True
        elif choice in ['n', 'no']:
            return False
            
        print("Invalid input. Please enter 'y' or 'n'.")

def watch_browser(driver):
    global browser_alive
    while True:
        try:
            _ = driver.window_handles
            time.sleep(0.5)
        except WebDriverException:
            print("\nDetected that the browser has closed.")
            browser_alive = False  # フラグを折る
            break

def waitLog(s) -> str:
    print(f"Waiting log...[{s}]")

    log = None
    while log is None:
        for entry in driver.get_log('browser'):
            message = entry["message"]
            if s in message:
                log = message
                print(log)
            else:
                print(f"log:{message}")

        time.sleep(0.5)

    return log

def watch_error():
    for entry in driver.get_log('browser'):
        message = entry["message"]
        if "error occurred!" in message:

            div = getEle("error-message")
            error_text = div.get_attribute("textContent")

            print(f"error occurred!\n[{error_text}]")
            clickBtn("close-dialog-btn")

            return error_text
        else:
            print(f"log:{message}")

    return None

def wait_for_download_complete(timeout=60):
    keyword = "capture:"
    log = waitLog(keyword)
    file_name = log.split(keyword)[1].strip().rstrip('"')
    print(f"captured file:{file_name}")

    seconds = 0
    while seconds < timeout:
        time.sleep(1)
        # フォルダ内のファイルリストを取得
        files = os.listdir(article_dir)

        if file_name in files:
            print("download completed.")
            return f"{article_dir}/{file_name}"
            
        seconds += 3
        
    raise TimeoutError("download timeout.")

def startChrome():
    global driver

    options = webdriver.ChromeOptions()

    abs_download_dir = os.path.abspath(article_dir)

    # ダウンロード先をデフォルトから上記のフォルダに変更する設定
    options.add_experimental_option("prefs", {
        "download.default_directory": abs_download_dir,
        "download.prompt_for_download": False, # ダイアログを出さない
    })

    options.add_argument("--enable-unsafe-webgpu")
    options.add_argument("--enable-features=Vulkan")
    options.add_argument("--disable-gpu-sandbox")

    options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

    driver = webdriver.Chrome(options=options)

    driver.maximize_window()
    driver.get("http://localhost:8000/")

    # Start a separate thread for monitoring.
    monitor_thread = threading.Thread(target=watch_browser, args=(driver,), daemon=True)
    monitor_thread.start()

    # Wait up to 10 seconds for the entire page to complete loading.
    WebDriverWait(driver, 10).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )
    print("ブラウザの読み込みが完了しました。")
    waitLog("GPUSims ready.")

def getEle(id):
    return driver.find_element(By.ID, id)

def setText(id, text):
    ele = getEle(id)
    driver.execute_script("arguments[0].value = arguments[1];", ele, text)

def clickBtn(id):
    toast = getEle("toast-message")
    while toast.is_displayed():
        time.sleep(1)

    btn = getEle(id)
    btn.click()
    print(f"[{id}] clicked.")

def uploadFile(path):
    doc = client.files.upload(file=path)
    print(f"{doc.name} is uploaded.")
    
    return doc.name

def showModels():
    for model in client.models.list():
        if all(kw in model.name for kw in ["gemini"]) and any(kw in model.name for kw in ["pro"]): # , "flash"
            print(f"{model.name}")
            print(f"    {model.supported_actions}")

def find_shader_code_by_nodeId(shader_codes:list[str], nodeId1:str):
    keyword = "AUTO-GENERATED SKELETON FOR NODE:"

    for shader_code in shader_codes:
        lines = shader_code.splitlines()
        for line in lines:
            if keyword in line:
                print(line)
                nodeId2 = line.split(keyword)[1].strip()
                print(f"{nodeId1} == {nodeId2} ? {nodeId1 == nodeId2}")
                if nodeId1 == nodeId2:
                    return shader_code

    return None

def set_shader_codes(shader_codes:list[str]):
    textareas = driver.find_elements(By.CLASS_NAME, "shader-textarea")
    for textarea in textareas:
        nodeId = textarea.get_attribute("data-node-id")
        if nodeId is None:
            print(f"nodeId is not set")
            sys.exit()

        print(f"node-id:{nodeId}")

        shader_code = find_shader_code_by_nodeId(shader_codes, nodeId)
        if shader_code is None:
            print(f"Can not find shader code")
            sys.exit()

        driver.execute_script("arguments[0].value = arguments[1];", textarea, shader_code)
        write_text_file(f"{nodeId}.wgsl", shader_code)

def exec_simulation(prompt:str):
    global client, chat

    clickBtn("launch-app-btn")
    waitLog("navigate complete.")

    agent = Agent()

    if useAI:
        client = genai.Client()
        chat = create_chat_from_cache()
        if chat is None:
            sys.exit()

        agent.create_schema(prompt)
    else:
        agent.schema = read_text_file("schema.js")

    agent.state = State.SCHEMA
    while browser_alive and agent.state != State.END:
        match agent.state:
            case State.SCHEMA:
                agent.make_skeleton_from_schema()
            case State.SKELETON:
                agent.implement_shader()
            case State.RUN:
                agent.run()

        error_text = watch_error()
        if error_text is not None:
            agent.handle_error(error_text)

        time.sleep(0.5)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage:python python\agent.py ARTICLE_ID")
        sys.exit()

    article_id = sys.argv[1]
    print("article id", article_id)

    article_dir = f"public/docs/ai/{article_id}"
    Path(article_dir).mkdir(parents=True, exist_ok=True)

    startChrome()

    useAI = True
    prompts = [
        "create a schema for a simple wave simulation with topology=triangle-list and shadingModel=vertex-color-normal."
    ]

    for prompt in prompts:
        exec_simulation(prompt)

    while browser_alive:
        time.sleep(0.1)

    driver.quit()