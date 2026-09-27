from urllib.request import urlopen
def read(feed_url):
    return urlopen(feed_url)
