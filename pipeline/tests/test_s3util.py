from pipeline.s3util import list_source_keys_from_pages

def test_list_source_keys_from_pages_filters_mp4():
    pages = [{"Contents": [
        {"Key": "두통/천장/251111_tue/a - Trim1.mp4"},
        {"Key": "두통/천장/251111_tue/raw/"},
        {"Key": "두통/천장/251111_tue/x.txt"},
    ]}]
    keys = list_source_keys_from_pages(pages)
    assert keys == ["두통/천장/251111_tue/a - Trim1.mp4"]
