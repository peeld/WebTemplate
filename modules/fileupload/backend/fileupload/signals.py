from django.dispatch import Signal

file_uploaded  = Signal()  # sent when client confirms S3 upload complete; provides: file
file_processed = Signal()  # sent when Lambda notifies processing complete; provides: file
