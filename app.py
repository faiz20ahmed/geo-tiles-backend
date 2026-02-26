from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"status": "Backend is running successfully 🚀"}

@app.get("/health")
def health():
    return {"healthy": True}
