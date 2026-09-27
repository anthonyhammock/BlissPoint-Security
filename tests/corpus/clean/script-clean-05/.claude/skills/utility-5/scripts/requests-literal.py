import requests
def get_price():
    return requests.get("https://api.example.com/price").json()
