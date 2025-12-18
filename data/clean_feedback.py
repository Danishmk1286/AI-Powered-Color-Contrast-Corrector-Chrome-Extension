import csv

input_file = "data/user_feedback.csv"
output_file = "data/user_feedback_clean.csv"

with open(input_file, "r", encoding="utf-8") as infile, \
     open(output_file, "w", newline="", encoding="utf-8") as outfile:
    for line in infile:
        # Replace any tab or multiple spaces with a comma
        clean = line.replace("\t", ",").replace("  ", ",").strip()
        outfile.write(clean + "\n")

print("✅ Clean CSV saved as:", output_file)
